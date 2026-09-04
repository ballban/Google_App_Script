"use strict";

/**
 * Builds a DeepL translation request.
 * @param {string} text - The text to be translated.
 * @param {string} [sourceLang='zh'] - The source language of the text.
 * @param {string} [targetLang='en'] - The target language for the translation.
 * @returns {object|null} - A UrlFetchApp request or null when the key is missing.
 */
function buildDeepLRequest(text, sourceLang = "zh", targetLang = "en") {
  const apiKey =
    PropertiesService.getScriptProperties().getProperty("DEEPL_API_KEY");
  if (!apiKey) return null;

  const payload = {
    text: [text],
    target_lang: targetLang,
    source_lang: sourceLang,
  };
  return {
    url: "https://api-free.deepl.com/v2/translate",
    method: "post",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify(payload),
  };
}

function parseDeepLResponse(response) {
  try {
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log(
        `DeepL API Error: ${responseCode} - ${response.getContentText()}`,
      );
      return `Error: ${responseCode}`;
    }

    const data = JSON.parse(response.getContentText());
    const result =
      data.translations && data.translations.length > 0
        ? data.translations[0].text
        : "No value";
    Logger.log(`DeepL: ${result}`);
    return result;
  } catch (err) {
    Logger.log(`DeepL response error: ${err}`);
    return "Error: Exception";
  }
}

function deepl(text, sourceLang = "zh", targetLang = "en") {
  Logger.log("deepl start.");
  const request = buildDeepLRequest(text, sourceLang, targetLang);
  if (request == null) {
    Logger.log("DeepL API key not found.");
    return "Error: API Key missing";
  }

  try {
    const options = {
      method: request.method,
      headers: request.headers,
      payload: request.payload,
    };
    return parseDeepLResponse(UrlFetchApp.fetch(request.url, options));
  } catch (err) {
    Logger.log(`DeepL Fetch Error: ${err}`);
    return "Error: Exception";
  }
}
