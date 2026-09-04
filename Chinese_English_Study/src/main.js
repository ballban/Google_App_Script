"use strict";

let candidates = [];
let processing = false;

// Configure this function as an installable spreadsheet "On edit" trigger.
function on_edit(e) {
  try {
    Logger.log("on_edit start.");
    if (!e || !e.range) {
      Logger.log("on_edit skipped: event range is missing.");
      return;
    }

    let range = e.range;
    // return if data is not start from column A
    if (range.getColumn() != 1) return;

    const rowIndex = range.getRowIndex();
    const rowNum = range.getNumRows();
    if (rowIndex == 1 && rowNum == 1) return;

    const firstDataRow = rowIndex == 1 ? 1 : 0;
    for (let i = firstDataRow; i < rowNum; i++) {
      let cell = range.getCell(i + 1, 1);
      const rawValue = cell.getValue();
      if (typeof rawValue !== "string") {
        Logger.log(`Skipping non-text input at row ${cell.getRowIndex()}.`);
        continue;
      }

      let value = rawValue.trim();
      if (value == "") continue;
      let dictObject = {
        word: value,
        baiduHanyuObject: new BaiduHanyuObject(),
        MDBG: "",
        deepL: "",
        cell: cell,
        rowIndex: cell.getRowIndex(),
        sheet: range.getSheet(),
      };
      candidates.push(dictObject);
      Logger.log(`Added candidate: ${value}`);
    }

    if (!processing && candidates.length > 0) main();
    Logger.log("on_edit end.");
  } catch (err) {
    Logger.log(`on_edit error: ${err}`);
  }
}

const MAX_BATCH_SIZE = 20;

function main() {
  processing = true;
  try {
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
  } finally {
    processing = false;
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
    .filter((job) => job.kind === "character" && job.dict.baiduHanyuObject.pinyinList.length === 0)
    .map((job) => ({
      dict: job.dict,
      kind: "word",
      request: buildBaiduHanyuRequest(job.dict.word, "word"),
    }));
  const characterFallbackResponses = fetchAllJobs(characterFallbackJobs);
  characterFallbackJobs.forEach((job, index) => {
    const result = parseBaiduHanyuWordResponse(characterFallbackResponses[index]);
    if (result.pinyinList.length > 0) job.dict.baiduHanyuObject = result;
  });

  const moedictJobs = dicts
    .filter((dict) => dict.baiduHanyuObject.pinyinList.length === 0)
    .map((dict) => ({
      dict,
      word: dict.word,
      request: buildMoedictRequest(dict.word),
    }))
    .filter((job) => job.request != null);
  const moedictResponses = fetchAllJobs(moedictJobs);
  moedictJobs.forEach((job, index) => {
    const result = parseMoedictResponse(moedictResponses[index], job.word);
    if (result.pinyinList.length > 0) job.dict.baiduHanyuObject = result;
  });

  const traditionalConversionJobs = moedictJobs
    .filter((job) => job.dict.baiduHanyuObject.pinyinList.length === 0)
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
    if (result.pinyinList.length > 0) job.dict.baiduHanyuObject = result;
  });

  const simplificationJobs = moedictJobs
    .filter((job) => job.dict.baiduHanyuObject.pinyinList.length > 0)
    .map((job) => {
      const slots = getMoedictTextSlots(job.dict.baiduHanyuObject);
      return {
        dict: job.dict,
        request: buildMoedictSimplifiedRequest(
          JSON.stringify(slots.map((slot) => slot.value)),
        ),
        textCount: slots.length,
      };
    })
    .filter((job) => job.textCount > 0 && job.request != null);
  const simplificationResponses = fetchAllJobs(simplificationJobs);
  simplificationJobs.forEach((job, index) => {
    applyMoedictSimplifiedText(
      job.dict.baiduHanyuObject,
      parseMoedictSimplifiedResponse(simplificationResponses[index]),
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
  const chineseDefinitionWithSource =
    candidate.baiduHanyuObject.source === "Moedict" && chineseDefinition !== ""
      ? `(Moedict) ${chineseDefinition}`
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
    candidate.cell.setFontColor("red");
  }
}

/**
 * Logs the specified value to the spreadsheet log.
 *
 * @param value - The value to be logged.
 */
function log(value) {
  Logger.log(value);
  let row = 1;
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("log");
  if (sheet == null) return;
  let range = sheet.getRange(`B${row}:C${row}`);
  while (range.getValue() != "") {
    row += 1;
    range = sheet.getRange(`B${row}:C${row}`);
  }
  range.setValues([[new Date().toLocaleString(), value]]);
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
