"use strict";
/**
 * Fetches English translation for a given Chinese word using the MDbg API.
 * @param {string} input - The Chinese word to be translated.
 * @returns {string} - The English translation of the input word, or null if no translation is found.
 */
function MDBGApi(input) {
  if (input == "") return "";
  Logger.log("MDBGApi start.");
  const url = `https://zhres.herokuapp.com/api/vocab/match`;
  const payload = {
    entry: input,
  };
  let options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = response.getContentText();
    const data = JSON.parse(json);
    Logger.log(data);
    const result = data["result"];
    if (result.length == 0) {
      return "";
    }
    return result[0]["english"].join(" / ");
  } catch (err) {
    return "Error on MDBG Api";
  }
}
/**
 * Builds an MDBG.net lookup request.
 *
 * @param {string} input - The Chinese word to search for.
 * @returns {{url: string}|null} - A request object, or null for empty input.
 */
function buildMDBGRequest(input) {
  if (typeof input !== "string" || input.trim() === "") {
    return null;
  }

  const normalizedInput = input.trim();
  return {
    url: `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=c%3A${encodeURIComponent(normalizedInput)}`,
  };
}

function parseMDBGResponse(response) {
  try {
    if (response.getResponseCode() !== 200) {
      Logger.log(`MDBGWeb failed: HTTP ${response.getResponseCode()}`);
      return { pinyin: "", definition: "" };
    }

    const $ = Cheerio.load(response.getContentText());
    const noResults = $(':contains("No results found searching for")').length;
    if (noResults != 0) return { pinyin: "", definition: "" };
    const firstRow = $(".row").first();
    const pinyin = firstRow
      .find(".pinyin span")
      .toArray()
      .map((x) => $(x).text())
      .join("");
    const definition = $(".row .defs")
      .toArray()
      .map((x) => $(x).text());
    Logger.log(`MDBG definition: ${definition}`);
    return { pinyin, definition: definition.join(", ") };
  } catch (err) {
    Logger.log(`MDBGWeb failed: ${err}`);
    return { pinyin: "", definition: "" };
  }
}

function MDBGWeb(input) {
  const request = buildMDBGRequest(input);
  if (request == null) return { pinyin: "", definition: "" };

  Logger.log("MDBGWeb start.");
  try {
    return parseMDBGResponse(UrlFetchApp.fetch(request.url));
  } catch (err) {
    Logger.log(`MDBGWeb fetch failed: ${err}`);
    return { pinyin: "", definition: "" };
  }
}
