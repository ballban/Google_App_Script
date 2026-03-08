"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const baiduHanyu_1 = require("./baiduHanyu");
const baiduHanyu_2 = require("./baiduHanyu");
const deepL_1 = require("./deepL");
let candidates = [];
let processing = false;
function on_edit(e) {
    try {
        Logger.log("on_edit start.");
        let range = e.range;
        // return if data is not start from column A
        if (range.getColumn() != 1)
            return;
        // return if data is not start from row 2
        let rowIndex = range.getRowIndex();
        if (rowIndex == 1)
            return;
        let rowNum = range.getNumRows();
        for (let i = 0; i < rowNum; i++) {
            let cell = range.getCell(i + 1, 1);
            let value = cell.getValue().trim();
            if (value == "")
                continue;
            let dictObject = {
                word: value,
                baiduHanyuObject: new baiduHanyu_1.BaiduHanyuObject(),
                MDBG: "",
                deepL: "",
                cell: cell,
            };
            candidates.push(dictObject);
            Logger.log(`Added candidate: ${value}`);
        }
        // Kick off async processing
        if (!processing)
            void main(e.range.getSheet());
        Logger.log("on_edit end.");
    }
    catch (err) {
        Logger.log(`on_edit error: ${err}`);
    }
}
async function main(sheet) {
    processing = true;
    Logger.log(`candidates: ${candidates.length}`);
    // Process candidates by popping from the end to avoid re-scans
    while (candidates.length > 0) {
        const dict = candidates.pop();
        try {
            addLoadingText(sheet, dict);
            await processCandidate(dict);
            pasteToSheet(sheet, dict);
            changeCellFontColor(dict);
        }
        catch (err) {
            logError(err, dict);
        }
    }
    processing = false;
}
function addLoadingText(sheet, dict) {
    const rowIndex = dict.cell.getRowIndex();
    sheet.getRange(rowIndex, 3).setValue("Loading...");
}
async function processCandidate(dict) {
    var _a;
    Logger.log("baiduHanyu & MDBG start (parallel).");
    // Run Baidu Hanyu and MDBG in parallel
    const [baiduResult, mdbgResult] = await Promise.all([
        Promise.resolve((0, baiduHanyu_1.baiduHanyu)(dict.word)),
        Promise.resolve(MDBGWeb(dict.word)),
    ]);
    dict.baiduHanyuObject = baiduResult;
    Logger.log("baiduHanyu finish.");
    dict.MDBG = mdbgResult !== null && mdbgResult !== void 0 ? mdbgResult : "";
    Logger.log("MDBG finish.");
    // Only call DeepL if needed
    if (dict.MDBG == "") {
        Logger.log("DeepL start.");
        try {
            dict.deepL = (_a = (await Promise.resolve((0, deepL_1.deepl)(dict.word)))) !== null && _a !== void 0 ? _a : "";
        }
        catch (e) {
            Logger.log(`DeepL error in processCandidate: ${e}`);
            dict.deepL = "Error";
        }
        Logger.log("DeepL finish.");
    }
    Logger.log("Done.");
}
/**
 * Copies the data from the candidate to the specified sheet.
 *
 * @param sheet - The Google Sheets sheet to paste the data into.
 * @param candidate - The candidate to paste.
 */
function pasteToSheet(sheet, candidate) {
    Logger.log("pasteToSheet start.");
    const rowIndex = candidate.cell.getRowIndex();
    let data = [];
    candidate.baiduHanyuObject.pinyinList.forEach((pinyinObject, i) => {
        if (!pinyinObject.isCommon)
            return;
        data.push([
            i == 0 ? candidate.word : "",
            pinyinObject.pinyin,
            pinyinObject.getFormattedDefinition(),
        ]);
    });
    const englishDefinition = candidate.MDBG == ""
        ? `(deepL) ${candidate.deepL}`
        : `(MDBG) ${candidate.MDBG}`;
    // Handle empty definition list and fill last empty definition if present
    if (data.length === 0) {
        data.push([candidate.word, "", englishDefinition]);
    }
    else {
        const lastIndex = data.length - 1;
        if (data[lastIndex][2] == "") {
            data[lastIndex][2] = englishDefinition;
        }
        else {
            data.push(["", "", englishDefinition]);
        }
    }
    sheet.getRange(rowIndex, 1, data.length, 3).setValues(data);
}
function changeCellFontColor(candidate) {
    Logger.log(`changeCellFontColor start. type: ${candidate.baiduHanyuObject.type}`);
    if (candidate.baiduHanyuObject.type == baiduHanyu_2.WordType.idiom) {
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
    if (sheet == null)
        return;
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
        const serialized = typeof err === "string"
            ? err
            : JSON.stringify(err, Object.getOwnPropertyNames(err));
        log(serialized);
    }
    catch (e) {
        log(String(err));
    }
}
