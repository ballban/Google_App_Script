"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepl = deepl;
/**
 * Translates a given text using the DeepL API.
 * @param {string} text - The text to be translated.
 * @param {string} [sourceLang='zh'] - The source language of the text. Defaults to 'zh' (Chinese).
 * @param {string} [targetLang='en'] - The target language for the translation. Defaults to 'en' (English).
 * @returns {string} - The translated text.
 */
function deepl(text, sourceLang = "zh", targetLang = "en") {
    Logger.log("deepl start.");
    const apiKey = PropertiesService.getScriptProperties().getProperty("DEEPL_API_KEY");
    if (!apiKey) {
        Logger.log("DeepL API key not found.");
        return "Error: API Key missing";
    }
    const url = `https://api-free.deepl.com/v2/translate`; // Base URL
    // Construct payload and headers
    const payload = {
        text: [text],
        target_lang: targetLang,
        source_lang: sourceLang,
    };
    const options = {
        method: "post",
        headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        payload: JSON.stringify(payload),
    };
    try {
        let response = UrlFetchApp.fetch(url, options);
        let responseCode = response.getResponseCode();
        if (responseCode !== 200) {
            Logger.log(`DeepL API Error: ${responseCode} - ${response.getContentText()}`);
            return `Error: ${responseCode}`;
        }
        let json = response.getContentText();
        let data = JSON.parse(json);
        let result = data.translations && data.translations.length > 0
            ? data.translations[0].text
            : "No value";
        Logger.log(`DeepL: ${result}`);
        return result;
    }
    catch (e) {
        Logger.log(`DeepL Fetch Error: ${e}`);
        return "Error: Exception";
    }
}
