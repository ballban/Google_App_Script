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
 * @returns {{url: string, muteHttpExceptions: boolean}|null} - A request object, or null for empty input.
 */
function buildMDBGRequest(input) {
  if (typeof input !== "string" || input.trim() === "") {
    return null;
  }

  const normalizedInput = input.trim();
  return {
    url: `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=c%3A${encodeURIComponent(normalizedInput)}`,
    // fetchAll throws for the whole batch when any unmuted request fails.
    muteHttpExceptions: true,
  };
}

// MDBG result markup is parsed with string matching because an HTML parser
// library is loaded on every edit trigger and slows each lookup. This relies on
// result rows being `<tr class="row">` and `pinyin`/`defs` divs not nesting divs.
function getMDBGResultRows(html) {
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  return body
    .split('<tr class="row">')
    .slice(1)
    .map((row) => row.split("</tbody>")[0]);
}

function getMDBGDivContents(html, className) {
  const pattern = new RegExp(`<div class="${className}"[^>]*>([\\s\\S]*?)</div>`, "g");
  return Array.from(html.matchAll(pattern), (match) => match[1]);
}

const MDBG_NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

function getMDBGText(html) {
  return html
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, "")
    .replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (entity, code) => {
      if (code[0] === "#") {
        const isHex = code[1] === "x" || code[1] === "X";
        return String.fromCodePoint(parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10));
      }
      return Object.prototype.hasOwnProperty.call(MDBG_NAMED_ENTITIES, code)
        ? MDBG_NAMED_ENTITIES[code]
        : entity;
    });
}

function parseMDBGResponse(response) {
  try {
    if (response.getResponseCode() !== 200) {
      Logger.log(`MDBGWeb failed: HTTP ${response.getResponseCode()}`);
      return { pinyin: "", definition: "" };
    }

    const html = response.getContentText();
    if (html.indexOf("No results found searching for") !== -1) {
      return { pinyin: "", definition: "" };
    }
    const rows = getMDBGResultRows(html);
    const pinyin = rows.length === 0
      ? ""
      : getMDBGDivContents(rows[0], "pinyin")
        .flatMap((pinyinHtml) =>
          Array.from(pinyinHtml.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g), (match) =>
            getMDBGText(match[1]),
          ),
        )
        .join("");
    const definition = rows.flatMap((row) =>
      getMDBGDivContents(row, "defs").map(getMDBGText),
    );
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
    return parseMDBGResponse(
      UrlFetchApp.fetch(request.url, {
        muteHttpExceptions: request.muteHttpExceptions,
      }),
    );
  } catch (err) {
    Logger.log(`MDBGWeb fetch failed: ${err}`);
    return { pinyin: "", definition: "" };
  }
}
