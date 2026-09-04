"use strict";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openrouter/free";
const OPENROUTER_MAX_TOKENS = 1000;

function getOpenRouterProvider() {
  return {
    displayName: "OpenRouter",
    buildRequest: buildOpenRouterRequest,
    parseResponse: parseOpenRouterResponse,
  };
}

function buildOpenRouterRequest(word, systemPrompt) {
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
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Define the Chinese word or phrase between the tags.\n<term>${normalizedWord}</term>`,
        },
      ],
      temperature: 0.2,
      max_tokens: OPENROUTER_MAX_TOKENS,
      reasoning: {
        exclude: true,
      },
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
