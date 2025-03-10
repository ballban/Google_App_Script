let candidates: Array<DictObject> = [];

type DictObject = {
  word: string;
  baiduHanyuObject: BaiduHanyuObject;
  MDBG: string;
  deepL: string;
  cell: GoogleAppsScript.Spreadsheet.Range;
  done: boolean;
};

function on_edit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  let range = e.range;

  // return if data is not start from column A
  if (range.getColumn() != 1) return;

  let rowIndex: number = range.getRowIndex();
  if (rowIndex == 1) return;
  let rowNum: number = range.getNumRows();

  for (let i = 0; i < rowNum; i++) {
    let cell = range.getCell(i + 1, 1);
    let value: string = cell.getValue().trim();
    if (value == "") continue;
    let dictObject: DictObject = {
      word: value,
      baiduHanyuObject: new BaiduHanyuObject(),
      MDBG: "",
      deepL: "",
      cell: cell,
      done: false,
    };
    candidates.push(dictObject);
  }

  main(e.range.getSheet());
}

function main(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  Logger.log(`candidates: ${candidates.length}`);
  let completedCandidates: Array<DictObject> = [];

  for (let i = 0; i < candidates.length; i++) {
    const dict = candidates[i];
    if (dict.done) continue;

    try {
      addLoadingText(sheet, dict);
      processCandidate(dict);
      pasteToSheet(sheet, dict);
      changeCellFontColor(dict);
      completedCandidates.push(dict);
    } catch (err) {
      logError(err, dict);
    }
  }

  // Remove completed candidates from the main array
  candidates = candidates.filter(
    (candidate) => !completedCandidates.includes(candidate)
  );
}

function addLoadingText(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  dict: DictObject
): void {
  const rowIndex = dict.cell.getRowIndex();
  sheet.getRange(`R${rowIndex}C3`).setValue("Loading...");
}

function processCandidate(dict: DictObject): void {
  Logger.log("baiduHanyu start.");
  dict.baiduHanyuObject = baiduHanyu(dict.word);
  Logger.log("baiduHanyu finish.");
  dict.MDBG = MDBGWeb(dict.word) ?? "";
  Logger.log("MDBG finish.");
  if (dict.MDBG == "") dict.deepL = deepl(dict.word) ?? "";
  Logger.log("Deepl finish.");
  dict.done = true;
  Logger.log("Done.");
}

/**
 * Copies the data from the candidate to the specified sheet.
 *
 * @param sheet - The Google Sheets sheet to paste the data into.
 * @param candidate - The candidate to paste.
 */
function pasteToSheet(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  candidate: DictObject
): void {
  if (!candidate.done) return;

  const rowIndex = candidate.cell.getRowIndex();
  let data: any[][] = [];
  candidate.baiduHanyuObject.definitionList.forEach(
    (definition: ComprehensiveDefinitionObject, i: number) => {
      data.push([
        i == 0 ? candidate.word : "",
        definition.pinyin,
        definition.getDefinition(),
      ]);
    }
  );

  const englishDefinition =
    candidate.MDBG == ""
      ? `(deepL) ${candidate.deepL}`
      : `(MDBG) ${candidate.MDBG}`;
  // If the last definition is empty, fill it with the English definition
  // Otherwise, add a new row with the English definition
  let count = candidate.baiduHanyuObject.definitionList.length;
  const lastIndex = data.length - 1;
  if (data[lastIndex][2] == "") {
    data[lastIndex][2] = englishDefinition;
    count--;
  } else {
    data.push(["", "", englishDefinition]);
  }

  sheet.getRange(`R${rowIndex}C1:R${rowIndex + count}C3`).setValues(data);
}

function changeCellFontColor(candidate: DictObject): void {
  Logger.log(
    `changeCellFontColor start. type: ${candidate.baiduHanyuObject.type}`
  );
  if (candidate.baiduHanyuObject.type == baiduHanyuApiType.idiom) {
    candidate.cell.setFontColor("red");
  }
}

/**
 * Logs the specified value to the spreadsheet log.
 *
 * @param value - The value to be logged.
 * @returns void
 */
function log(value: any): void {
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
function logError(err: any, dict: DictObject): void {
  Logger.log(`Error processing word: ${dict.word}`);
  log(err);
}
