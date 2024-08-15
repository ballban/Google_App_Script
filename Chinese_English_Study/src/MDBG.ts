import Cheerio from "cheerio";

/**
 * Fetches English translation for a given Chinese word using the MDbg API.
 * @param {string} input - The Chinese word to be translated.
 * @returns {string} - The English translation of the input word, or null if no translation is found.
 */
function MDBGApi(input: string): string {
  if (input == "") return "";
  const url = `https://zhres.herokuapp.com/api/vocab/match`;
  const payload = {
    entry: input,
  };

  let options: any = {
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
 * Fetches the definition of a Chinese word from MDBG.net.
 *
 * @param {string} input - The Chinese word to search for.
 * @returns {string|null} - The definition of the word, or null if no results found.
 */
function MDBGWeb(input: string): string {
  if (input == "") return "";
  let url = `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqb=c%3A${input}`;
  try {
    let response = UrlFetchApp.fetch(url);
    const $ = Cheerio.load(response.getContentText());

    const noResults = $(':contains("No results found searching for")').length;
    if (noResults != 0) return "";

    //const pinyin = $('.row .pinyin span').toArray().map(x => $(x).text());
    const definition = $(".row .defs")
      .toArray()
      .map((x) => $(x).text());

    //Logger.log(pinyin);
    Logger.log(definition);

    return definition.join(", ");
  } catch (err) {
    return "";
  }
}
