let candidates: Array<DictObject> = [];

type DictObject = {
  word: string;
  baiduHanyu: BaiduHanyuObject;
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
      baiduHanyu: new BaiduHanyuObject(),
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
  for (let i = 0; i < candidates.length; i++) {
    const dict = candidates[i];
    if (dict.done) continue;

    try {
      Logger.log("baiduHanyu start.");
      dict.baiduHanyu = baiduHanyu(dict.word);
      Logger.log("baiduHanyu finish.");
      dict.MDBG = MDBGWeb(dict.word) ?? null;
      Logger.log("MDBG finish.");
      if (dict.MDBG == "") dict.deepL = deepl(dict.word) ?? "";
      Logger.log("Deepl finish.");
      dict.done = true;
      Logger.log("Done.");

      pasteToSheet(sheet);
      changeCellFontColor();
      candidates = candidates.filter((candidate) => !candidate.done);
    } catch (err) {
      log(err);
      throw err;
    }
  }
}

/**
 * Copies the data from the candidates array to the specified sheet.
 *
 * @param sheet - The Google Sheets sheet to paste the data into.
 */
function pasteToSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate.done) continue;

    const rowIndex = candidate.cell.getRowIndex();
    let data = [];
    for (let j = 0; j < candidate.baiduHanyu.definitionList.length; j++) {
      data.push([
        j == 0 ? candidate.word : "",
        candidate.baiduHanyu.definitionList[j].pinyin,
        candidate.baiduHanyu.definitionList[j].getDefinition(),
      ]);
    }
    Logger.log(`data: ${data}`);
    let count = candidate.baiduHanyu.definitionList.length;
    const lastIndex = data.length - 1;
    if (data[lastIndex][2] == "") {
      data[lastIndex][2] =
        candidate.MDBG == "" ? candidate.deepL : candidate.MDBG;
      count--;
    } else
      data.push([
        "",
        "",
        candidate.MDBG == "" ? candidate.deepL : candidate.MDBG,
      ]);

    sheet.getRange(`R${rowIndex}C1:R${rowIndex + count}C3`).setValues(data);
    candidate.done = true;
  }
}

function changeCellFontColor() {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.baiduHanyu.type == baiduHanyuApiType.idiom) {
      candidate.cell.setFontColor("red");
    }
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
