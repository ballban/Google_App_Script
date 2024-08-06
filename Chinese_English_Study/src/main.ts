var candidates: Array<DictObject> = [];

type DictObject = {
  word: string;
  baiduHanyu: BaiduHanyuObject;
  pinyin: Array<string>;
  MDBG: string;
  deepL: string;
};

function on_edit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  let range = e.range;

  // return if data is not start from column A
  if (range.getColumn() != 1) return;

  let rowIndex: number = range.getRowIndex();
  if (rowIndex == 1) return;
  let rowNum: number = range.getNumRows();

  Logger.log(`range date: ${range.getValues()}`);
  Logger.log(`rowIndex: ${rowIndex}, rowNum: ${rowNum}`);

  for (let i = 0; i < range.getNumRows(); i++) {
    let cell = range.getCell(i + 1, 1);
    let value = cell.getValue();
    if ((value = "")) continue;
    let dictObject: DictObject = {
      word: value,
      baiduHanyu: new BaiduHanyuObject(),
      pinyin: [],
      MDBG: "",
      deepL: "",
    };
    candidates.push(dictObject);
  }

  main(range.getSheet());
}

function main(
  sheet: GoogleAppsScript.Sheets,
  cell: GoogleAppsScript.Spreadsheet.Range
): void {
  let value = cell.getValue();

  // return when cell is empty
  if (value == "") {
    return;
  }
  try {
    // C1 中文
    // C2 拼音
    // C3 解释&例句&备注
    // C4 MDbg / DeepL
    // C5 MandarinApi

    let rowIndex = range.getRowIndex();

    // ***********************************************************************
    // baiduhanyu pinyins and definitions
    // ***********************************************************************
    // init
    let baiduHanyu = newGetBaiduHanyu(value) ?? [[[""]], [[""]]];
    let pinyins = baiduHanyu[0];
    let definitions = baiduHanyu[1];

    if (baiduHanyu.length > 0) {
      sheet
        .getRange(`R${rowIndex}C2:R${rowIndex}C3`)
        .setValue("Loading baidu Hanyu");

      // insert row
      if (baiduHanyu.length > 1) {
        sheet.insertRowsAfter(rowIndex, baiduHanyu.length - 1);
      }

      // set baiduhanyu data
      sheet
        .getRange(`R${rowIndex}C2:R${rowIndex + pinyins.length - 1}C2`)
        .setValues(pinyins);
      sheet
        .getRange(`R${rowIndex}C3:R${rowIndex + definitions.length - 1}C3`)
        .setValues(definitions);
    }

    // ***********************************************************************
    // MDbg / DeepL
    // get MDbg first, and get DeepL if MDbg returns empty string
    // ***********************************************************************
    sheet
      .getRange(`R${rowIndex + definitions.length}C3`)
      .setValue("Loading english definition");
    const englishDefinition = MDbgApi(value) ?? deepl(value);
    sheet.getRange(`R${rowIndex}C4`).setValue(englishDefinition);
    sheet
      .getRange(`R${rowIndex + definitions.length}C3`)
      .setValue(englishDefinition);

    // ***********************************************************************
    // MandarinApi
    // ***********************************************************************
    copyValueFromMandarinApi(sheet, rowIndex, baiduHanyu.length);
  } catch (err) {
    log(err);
  }
}

// Copy C5 value to the cell to prevent sending http request over and over again
async function copyValueFromMandarinApi(sheet, rowIndex, baiduHanyu) {
  // C5 MandarinApi
  let range = sheet.getRange(`R${rowIndex}C5`);
  let value = range.getValue();
  if (value == "") {
    Utilities.sleep(3000);
    copyValueFromMandarinApi(sheet, rowIndex);
  } else {
    range.setValue(value);
    if (baiduHanyu == 0) sheet.getRange(`R${rowIndex}C2`).setValue(value);
  }
}

function fixHtmlContentText(html) {
  // close unclosed tags
  html = html.replace(/(<(?=link|meta|br|input)[^>]*)(?<!\/)>/gi, "$1/>");
  // force script / style content into cdata
  html = html
    .replace(/(<(script|style)[^>]*>)/gi, "$1<![CDATA[")
    .replace(/(<\/(script|style)[^>]*>)/gi, "]]>$1");
  // change & to &amp;
  html = html.replace(/&(?!amp;)/g, "&amp;");
  // remove <!DOCTYPE html>
  html = html.replace(/<!DOCTYPE html>/, "");
  return html;
}

function log(value) {
  Logger.log(value);
  let row = 1;
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("log");

  let range = sheet.getRange(`B${row}:C${row}`);
  while (range.getValue() != "") {
    row += 1;
    range = sheet.getRange(`B${row}:C${row}`);
  }
  range.setValues([[new Date().toLocaleString(), value]]);
}
