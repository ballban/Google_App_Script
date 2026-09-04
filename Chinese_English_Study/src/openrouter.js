"use strict";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openrouter/free";
const OPENROUTER_SYSTEM_PROMPT =
  "You are a Chinese dictionary assistant. Given a Chinese word or phrase, return one concise dictionary-style definition in Simplified Chinese. Return only the Chinese definition text; do not include pinyin, English, Markdown, labels, or a preamble. If you cannot identify the word or phrase with reasonable confidence, return an empty string.";

function getOpenRouterProvider() {
  return {
    displayName: "OpenRouter",
    buildRequest: buildOpenRouterRequest,
    parseResponse: parseOpenRouterResponse,
  };
}

function buildOpenRouterRequest(word) {
  if (typeof word !== "string" || word.trim() === "") return null;

  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENROUTER_API_KEY");
  if (!apiKey) {
    Logger.log("OpenRouter API key not found.");
    return null;
  }

  const normalizedWord = word.trim();
  return {
    url: OPENROUTER_ENDPOINT,
    method: "post",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/ballban/Google_App_Script",
      "X-OpenRouter-Title": "Chinese English Study",
    },
    payload: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content: OPENROUTER_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Define the Chinese word or phrase between the tags.\n<term>${normalizedWord}</term>`,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
      stream: false,
    }),
    muteHttpExceptions: true,
  };
}

function parseOpenRouterResponse(response) {
  try {
    if (!response || response.getResponseCode() !== 200) {
      const responseCode = response ? response.getResponseCode() : 0;
      Logger.log(`OpenRouter failed: HTTP ${responseCode}`);
      return "";
    }

    const data = JSON.parse(response.getContentText());
    const firstChoice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = firstChoice && firstChoice.message ? firstChoice.message.content : "";
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => (part && typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
    }

    Logger.log("OpenRouter returned no text content.");
    return "";
  } catch (err) {
    Logger.log(`OpenRouter response failed: ${err}`);
    return "";
  }
}
