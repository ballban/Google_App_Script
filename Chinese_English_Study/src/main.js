"use strict";

const MAX_BATCH_SIZE = 20;
const LOG_SHEET_NAME = "log";
// Leaves most of the 6-minute trigger runtime for this execution's own lookups.
const EDIT_LOCK_TIMEOUT_MS = 120000;

// Configure this function as an installable spreadsheet "On edit" trigger.
function on_edit(e) {
  try {
    Logger.log("on_edit start.");
    if (!e || !e.range) {
      Logger.log("on_edit skipped: event range is missing.");
      return;
    }

    const range = e.range;
    // return if data is not start from column A
    if (range.getColumn() != 1) return;

    const sheet = range.getSheet();
    if (sheet.getName() === LOG_SHEET_NAME) return;

    const rowIndex = range.getRowIndex();
    const rowNum = range.getNumRows();
    if (rowIndex == 1 && rowNum == 1) return;

    const values = range.getValues();
    const candidates = [];
    const firstDataRow = rowIndex == 1 ? 1 : 0;
    for (let i = firstDataRow; i < rowNum; i++) {
      const rawValue = values[i][0];
      if (typeof rawValue !== "string") {
        Logger.log(`Skipping non-text input at row ${rowIndex + i}.`);
        continue;
      }

      const value = rawValue.trim();
      if (value == "") continue;
      candidates.push({
        word: value,
        baiduHanyuObject: new BaiduHanyuObject(),
        MDBG: "",
        deepL: "",
        rowIndex: rowIndex + i,
        sheet,
      });
      Logger.log(`Added candidate: ${value}`);
    }
    if (candidates.length === 0) return;

    // Every edit runs in a separate execution; serialize the ones that insert rows.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(EDIT_LOCK_TIMEOUT_MS)) {
      log(
        `on_edit skipped after waiting for another lookup: ${candidates
          .map((dict) => dict.word)
          .join(", ")}`,
      );
      return;
    }
    try {
      main(relocateCandidates(sheet, candidates));
    } finally {
      lock.releaseLock();
    }
    Logger.log("on_edit end.");
  } catch (err) {
    Logger.log(`on_edit error: ${err}`);
  }
}

/**
 * Finds the current row of each input after waiting for the lock. Earlier
 * executions only insert output rows, so inputs can move down but keep their
 * order; an input that no longer exists is skipped.
 */
function relocateCandidates(sheet, candidates) {
  const firstRow = candidates[0].rowIndex;
  const lastRow = sheet.getLastRow();
  if (lastRow < firstRow) return [];

  const columnA = sheet
    .getRange(firstRow, 1, lastRow - firstRow + 1, 1)
    .getValues()
    .map((row) => row[0]);
  const relocated = [];
  let searchFrom = firstRow;
  candidates.forEach((dict) => {
    let row = Math.max(dict.rowIndex, searchFrom);
    while (row <= lastRow) {
      const value = columnA[row - firstRow];
      if (typeof value === "string" && value.trim() === dict.word) break;
      row += 1;
    }
    if (row > lastRow) {
      Logger.log(`Skipping input that is no longer in column A: ${dict.word}`);
      return;
    }

    dict.rowIndex = row;
    relocated.push(dict);
    searchFrom = row + 1;
  });
  return relocated;
}

function main(candidates) {
  Logger.log(`candidates: ${candidates.length}`);
  while (candidates.length > 0) {
    // Process lower input rows first so row insertion does not invalidate
    // candidates that are still waiting above them.
    const batchStart = Math.max(candidates.length - MAX_BATCH_SIZE, 0);
    const batch = candidates.splice(batchStart);
    batch.forEach(addLoadingText);

    try {
      processCandidates(batch);
    } catch (err) {
      batch.forEach((dict) => {
        dict.baiduHanyuObject = new BaiduHanyuObject();
        dict.MDBG = "";
        dict.deepL = "Error";
        logError(err, dict);
      });
    }

    for (let i = batch.length - 1; i >= 0; i--) {
      const dict = batch[i];
      try {
        pasteToSheet(dict);
        changeCellFontColor(dict);
      } catch (err) {
        logError(err, dict);
      }
    }
  }
}

function addLoadingText(dict) {
  dict.sheet.getRange(dict.rowIndex, 3).setValue("Loading...");
}

function fetchAllJobs(jobs) {
  if (jobs.length === 0) return [];

  try {
    return UrlFetchApp.fetchAll(jobs.map((job) => job.request));
  } catch (err) {
    Logger.log(`Batch fetch failed: ${err}`);
    return jobs.map(() => null);
  }
}

function processCandidates(dicts) {
  Logger.log(`Processing batch of ${dicts.length}.`);
  const providerJobs = [];
  const baiduJobs = [];

  dicts.forEach((dict) => {
    dict.baiduHanyuObject = new BaiduHanyuObject();
    dict.MDBG = "";
    dict.MDBGPinyin = "";
    dict.deepL = "";

    const baiduKind = dict.word.length === 1 ? "character" : "word";
    const baiduJob = {
      dict,
      kind: baiduKind,
      request: buildBaiduHanyuRequest(dict.word, baiduKind),
    };
    baiduJobs.push(baiduJob);
    providerJobs.push(baiduJob);

    const mdbgRequest = buildMDBGRequest(dict.word);
    if (mdbgRequest != null) {
      providerJobs.push({
        dict,
        kind: "mdbg",
        request: mdbgRequest,
      });
    }
  });

  const providerResponses = fetchAllJobs(providerJobs);
  providerJobs.forEach((job, index) => {
    const response = providerResponses[index];
    if (job.kind === "character") {
      job.dict.baiduHanyuObject = parseBaiduHanyuCharacterResponse(response);
    } else if (job.kind === "word") {
      job.dict.baiduHanyuObject = parseBaiduHanyuWordResponse(response);
    } else {
      const mdbgResult = parseMDBGResponse(response);
      job.dict.MDBG = mdbgResult.definition || "";
      job.dict.MDBGPinyin = mdbgResult.pinyin || "";
    }
  });

  const characterFallbackJobs = baiduJobs
    .filter((job) => job.kind === "character" && !hasChineseDefinition(job.dict.baiduHanyuObject))
    .map((job) => ({
      dict: job.dict,
      kind: "word",
      request: buildBaiduHanyuRequest(job.dict.word, "word"),
    }));
  const characterFallbackResponses = fetchAllJobs(characterFallbackJobs);
  characterFallbackJobs.forEach((job, index) => {
    const result = parseBaiduHanyuWordResponse(characterFallbackResponses[index]);
    if (hasChineseDefinition(result)) job.dict.baiduHanyuObject = result;
  });

  const moedictJobs = dicts
    .filter((dict) => !hasChineseDefinition(dict.baiduHanyuObject))
    .map((dict) => ({
      dict,
      word: dict.word,
      request: buildMoedictRequest(dict.word),
    }))
    .filter((job) => job.request != null);
  const moedictResponses = fetchAllJobs(moedictJobs);
  moedictJobs.forEach((job, index) => {
    const result = parseMoedictResponse(moedictResponses[index], job.word);
    if (hasChineseDefinition(result)) job.dict.baiduHanyuObject = result;
  });

  const traditionalConversionJobs = moedictJobs
    .filter((job) => !hasChineseDefinition(job.dict.baiduHanyuObject))
    .map((job) => ({
      dict: job.dict,
      word: job.word,
      request: buildMoedictTraditionalRequest(job.word),
    }))
    .filter((job) => job.request != null);
  const traditionalConversionResponses = fetchAllJobs(traditionalConversionJobs);
  const convertedMoedictJobs = [];
  traditionalConversionJobs.forEach((job, index) => {
    const traditionalWord = parseMoedictTraditionalResponse(
      traditionalConversionResponses[index],
    );
    if (traditionalWord === "" || traditionalWord === job.word) return;

    convertedMoedictJobs.push({
      dict: job.dict,
      word: traditionalWord,
      request: buildMoedictRequest(traditionalWord),
    });
  });
  const convertedMoedictResponses = fetchAllJobs(convertedMoedictJobs);
  convertedMoedictJobs.forEach((job, index) => {
    const result = parseMoedictResponse(
      convertedMoedictResponses[index],
      job.word,
    );
    if (hasChineseDefinition(result)) job.dict.baiduHanyuObject = result;
  });

  const aiJobs = dicts
    .filter((dict) => !hasChineseDefinition(dict.baiduHanyuObject))
    .map((dict) => ({
      dict,
      provider: DEFAULT_AI_PROVIDER,
      request: buildAiRequest(dict.word),
    }))
    .filter((job) => job.request != null);
  const aiResponses = fetchAllJobs(aiJobs);
  aiJobs.forEach((job, index) => {
    const aiData = parseAiResponse(aiResponses[index], job.provider);
    const result = createAiHanyuObject(
      job.dict.word,
      aiData,
      job.provider,
    );
    if (hasChineseDefinition(result)) job.dict.baiduHanyuObject = result;
  });

  const simplificationJobs = dicts
    .filter(
      (dict) =>
        hasChineseDefinition(dict.baiduHanyuObject) &&
        (dict.baiduHanyuObject.source === "Moedict" ||
          dict.baiduHanyuObject.source === "OpenRouter"),
    )
    .map((job) => {
      const slots = getChineseDefinitionTextSlots(job.baiduHanyuObject);
      return {
        dict: job,
        request: buildSimplifiedTextRequest(
          JSON.stringify(slots.map((slot) => slot.value)),
        ),
        textCount: slots.length,
      };
    })
    .filter((job) => job.textCount > 0 && job.request != null);
  const simplificationResponses = fetchAllJobs(simplificationJobs);
  simplificationJobs.forEach((job, index) => {
    applySimplifiedText(
      job.dict.baiduHanyuObject,
      parseSimplifiedTextResponse(simplificationResponses[index]),
    );
  });

  const deepLJobs = [];
  dicts.forEach((dict) => {
    if (dict.MDBG !== "") return;

    const request = buildDeepLRequest(dict.word);
    if (request == null) {
      dict.deepL = "Error: API Key missing";
      return;
    }
    deepLJobs.push({ dict, request });
  });

  const deepLResponses = fetchAllJobs(deepLJobs);
  deepLJobs.forEach((job, index) => {
    job.dict.deepL = parseDeepLResponse(deepLResponses[index]);
  });

  Logger.log("Batch processing complete.");
}

/**
 * Copies the data from the candidate to the specified sheet.
 *
 * @param candidate - The candidate to paste.
 */
function pasteToSheet(candidate) {
  Logger.log("pasteToSheet start.");
  const sheet = candidate.sheet;
  const rowIndex = candidate.rowIndex;
  const commonPinyinObjects = candidate.baiduHanyuObject.pinyinList.filter(
    (pinyinObject) => pinyinObject.isCommon,
  );
  const pinyin = commonPinyinObjects
    .map((pinyinObject) => pinyinObject.pinyin)
    .filter((value) => value != "")
    .join("\n");
  const chineseDefinition = commonPinyinObjects
    .map((pinyinObject) => pinyinObject.getFormattedDefinition())
    .filter((value) => value != "")
    .join("\n\n");
  const chineseSourceLabel =
    candidate.baiduHanyuObject.source === "Moedict"
      ? "(Moedict)"
      : candidate.baiduHanyuObject.source === "OpenRouter"
        ? "(OpenRouter)"
        : "";
  const chineseDefinitionWithSource =
    chineseSourceLabel !== "" && chineseDefinition !== ""
      ? `${chineseSourceLabel} ${chineseDefinition}`
      : chineseDefinition;
  const englishDefinition =
    candidate.MDBG == "" ? `(deepL) ${candidate.deepL}` : `(MDBG) ${candidate.MDBG}`;
  const data = [
    [
      candidate.word,
      pinyin || candidate.MDBGPinyin || "",
      chineseDefinitionWithSource,
    ],
    ["", "", englishDefinition],
  ];

  ensureWritableOutputRows(sheet, rowIndex, data.length);
  sheet.getRange(rowIndex, 1, data.length, 3).setValues(data);
  clearStaleOutputRows(sheet, rowIndex, data.length);
}

function ensureWritableOutputRows(sheet, rowIndex, rowCount) {
  const extraRows = rowCount - 1;
  if (extraRows <= 0) return;

  const missingRows = rowIndex + extraRows - sheet.getMaxRows();
  if (missingRows > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missingRows);

  const existingRows = sheet.getRange(rowIndex + 1, 1, extraRows, 3).getValues();
  const hasInputBelow = existingRows.some((row) => row[0] !== "");
  if (hasInputBelow) sheet.insertRowsAfter(rowIndex, extraRows);
}

function clearStaleOutputRows(sheet, rowIndex, rowCount) {
  let nextRow = rowIndex + rowCount;
  const maxRows = sheet.getMaxRows();

  while (nextRow <= maxRows) {
    const values = sheet.getRange(nextRow, 1, 1, 3).getValues()[0];
    if (values[0] !== "") break;
    if (values.every((value) => value === "")) break;

    sheet.getRange(nextRow, 1, 1, 3).clearContent();
    nextRow += 1;
  }
}

function changeCellFontColor(candidate) {
  Logger.log(`changeCellFontColor start. type: ${candidate.baiduHanyuObject.type}`);
  if (candidate.baiduHanyuObject.type == WordType.idiom) {
    candidate.sheet.getRange(candidate.rowIndex, 1).setFontColor("red");
  }
}

/**
 * Logs the specified value to the spreadsheet log.
 *
 * @param value - The value to be logged.
 */
function log(value) {
  Logger.log(value);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG_SHEET_NAME);
  if (sheet == null) return;
  sheet.appendRow(["", new Date().toLocaleString(), value]);
}

/**
 * Logs the error with additional context.
 *
 * @param err - The error to be logged.
 * @param dict - The dictionary object being processed when the error occurred.
 */
function logError(err, dict) {
  Logger.log(`Error processing word: ${dict.word}`);
  try {
    const serialized =
      typeof err === "string" ? err : JSON.stringify(err, Object.getOwnPropertyNames(err));
    log(serialized);
  } catch (e) {
    log(String(err));
  }
}
