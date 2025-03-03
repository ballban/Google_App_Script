/**
 * Translates a given text using the DeepL API.
 * @param {string} text - The text to be translated.
 * @param {string} [sourceLang='zh'] - The source language of the text. Defaults to 'zh' (Chinese).
 * @param {string} [targetLang='en'] - The target language for the translation. Defaults to 'en' (English).
 * @returns {string} - The translated text.
 */
function deepl(
  text: string,
  sourceLang: string = "zh",
  targetLang: string = "en"
): string {
  Logger.log("deepl start.");
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("DEEPL_API_KEY");
  if (!apiKey) throw new Error("DeepL API key not found.");

  const url = `https://api-free.deepl.com/v2/translate?auth_key=${apiKey}&text=${text}&target_lang=${targetLang}&source_lang=${sourceLang}`;
  let response = UrlFetchApp.fetch(url);
  if (response.getResponseCode() != 200) {
    return "Error";
  }
  let json = response.getContentText();
  let data = JSON.parse(json);
  let result =
    data.translations && data.translations.length > 0
      ? data.translations[0].text
      : "No value";
  Logger.log(`Deepl: ${result}`);
  return result;
}
