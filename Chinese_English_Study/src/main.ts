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

  // Logger.log(`range date: ${range.getValues()}`);
  // Logger.log(`rowIndex: ${rowIndex}, rowNum: ${rowNum}`);

  for (let i = 0; i < range.getNumRows(); i++) {
    let cell = range.getCell(i + 1, 1);
    let value: string = cell.getValue();
    Logger.log(`value: ${value}`);
    if ((value = "")) continue;
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
  for (let i = 0; i < candidates.length; i++) {
    const dict = candidates[i];
    if (dict.done) continue;
    Logger.log(`dict.word: ${dict.word}`);

    let word = dict.cell.getValue();

    try {
      dict.baiduHanyu = baiduHanyuApi(word) ?? new BaiduHanyuObject();
      Logger.log("baiduHanyu finish.");
      dict.MDBG = MDBGWeb(word) ?? null;
      Logger.log("MDBG finish.");
      if (dict.MDBG == "") dict.deepL = deepl(word) ?? "";
      Logger.log("Deepl finish.");
      dict.done = true;
      Logger.log("Done.");
    } catch (err) {
      log(err);
    }

    pasteToSheet(sheet);

    //   try {
    //     // C1 中文
    //     // C2 拼音
    //     // C3 解释&例句&备注
    //     // C4 MDbg / DeepL
    //     // C5 MandarinApi

    //     let rowIndex = range.getRowIndex();

    //     // ***********************************************************************
    //     // baiduhanyu pinyins and definitions
    //     // ***********************************************************************
    //     // init
    //     let baiduHanyu = newGetBaiduHanyu(value) ?? [[[""]], [[""]]];
    //     let pinyins = baiduHanyu[0];
    //     let definitions = baiduHanyu[1];

    //     if (baiduHanyu.length > 0) {
    //       sheet
    //         .getRange(`R${rowIndex}C2:R${rowIndex}C3`)
    //         .setValue("Loading baidu Hanyu");

    //       // insert row
    //       if (baiduHanyu.length > 1) {
    //         sheet.insertRowsAfter(rowIndex, baiduHanyu.length - 1);
    //       }

    //       // set baiduhanyu data
    //       sheet
    //         .getRange(`R${rowIndex}C2:R${rowIndex + pinyins.length - 1}C2`)
    //         .setValues(pinyins);
    //       sheet
    //         .getRange(`R${rowIndex}C3:R${rowIndex + definitions.length - 1}C3`)
    //         .setValues(definitions);
    //     }

    //     // ***********************************************************************
    //     // MDbg / DeepL
    //     // get MDbg first, and get DeepL if MDbg returns empty string
    //     // ***********************************************************************
    //     sheet
    //       .getRange(`R${rowIndex + definitions.length}C3`)
    //       .setValue("Loading english definition");
    //     const englishDefinition = MDbgApi(value) ?? deepl(value);
    //     sheet.getRange(`R${rowIndex}C4`).setValue(englishDefinition);
    //     sheet
    //       .getRange(`R${rowIndex + definitions.length}C3`)
    //       .setValue(englishDefinition);

    //     // ***********************************************************************
    //     // MandarinApi
    //     // ***********************************************************************
    //     copyValueFromMandarinApi(sheet, rowIndex, baiduHanyu.length);
    //   } catch (err) {
    //     log(err);
    //   }
  }
}

function pasteToSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
  for (let i = 0; i < candidates.length; i++) {
    const dict = candidates[i];
    if (!dict.done) continue;

    Logger.log(`dict.word: ${dict.word}`);
    const rowIndex = dict.cell.getRowIndex();
    const data = [
      [
        dict.cell.getValue(),
        dict.baiduHanyu.pinyinList[0],
        dict.baiduHanyu.definitionList[0],
      ],
      ["", "", dict.MDBG ?? dict.deepL],
    ];
    Logger.log(data);
    sheet.getRange(`R${rowIndex}C1:R${rowIndex + 1}C3`).setValues(data);
  }
}

// // Copy C5 value to the cell to prevent sending http request over and over again
// async function copyValueFromMandarinApi(
//   sheet: GoogleAppsScript.Spreadsheet.Sheet,
//   rowIndex: number,
//   baiduHanyu
// ) {
//   // C5 MandarinApi
//   let range = sheet.getRange(`R${rowIndex}C5`);
//   let value = range.getValue();
//   if (value == "") {
//     Utilities.sleep(3000);
//     copyValueFromMandarinApi(sheet, rowIndex);
//   } else {
//     range.setValue(value);
//     if (baiduHanyu == 0) sheet.getRange(`R${rowIndex}C2`).setValue(value);
//   }
// }

// function fixHtmlContentText(html) {
//   // close unclosed tags
//   html = html.replace(/(<(?=link|meta|br|input)[^>]*)(?<!\/)>/gi, "$1/>");
//   // force script / style content into cdata
//   html = html
//     .replace(/(<(script|style)[^>]*>)/gi, "$1<![CDATA[")
//     .replace(/(<\/(script|style)[^>]*>)/gi, "]]>$1");
//   // change & to &amp;
//   html = html.replace(/&(?!amp;)/g, "&amp;");
//   // remove <!DOCTYPE html>
//   html = html.replace(/<!DOCTYPE html>/, "");
//   return html;
// }

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
