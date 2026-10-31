"use strict";

const NVIDIA_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
// Chosen by test/ai-benchmark.js: the fastest model that returned valid
// dictionary JSON for every test word within AI_TIMEOUT_MS.
const NVIDIA_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
const NVIDIA_MAX_TOKENS = 1000;
const NVIDIA_API_KEY_PROPERTY = "NVIDIA_BUILD_API_KEY";

function getNvidiaProvider() {
  return {
    displayName: "NVIDIA Build",
    defaultModel: NVIDIA_MODEL,
    buildRequest: buildNvidiaRequest,
    parseResponse: parseNvidiaResponse,
  };
}

function buildNvidiaRequest(word, systemPrompt, model = NVIDIA_MODEL) {
  if (typeof word !== "string" || word.trim() === "") return null;

  const apiKey = PropertiesService.getScriptProperties().getProperty(
    NVIDIA_API_KEY_PROPERTY,
  );
  if (!apiKey) {
    Logger.log("NVIDIA Build API key not found.");
    return null;
  }

  const normalizedWord = word.trim();
  return {
    url: NVIDIA_ENDPOINT,
    method: "post",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    payload: JSON.stringify({
      model,
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
      top_p: 0.95,
      max_tokens: NVIDIA_MAX_TOKENS,
      // Reasoning tokens count toward max_tokens and roughly double latency;
      // the dictionary JSON does not need them.
      chat_template_kwargs: { thinking: false },
      stream: false,
    }),
    muteHttpExceptions: true,
  };
}

function parseNvidiaResponse(response) {
  try {
    if (!response || response.getResponseCode() !== 200) {
      const responseCode = response ? response.getResponseCode() : 0;
      Logger.log(`NVIDIA Build failed: HTTP ${responseCode}`);
      return "";
    }

    const data = JSON.parse(response.getContentText());
    const firstChoice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = firstChoice && firstChoice.message ? firstChoice.message.content : "";
    if (typeof content === "string" && content.trim() !== "") return content.trim();

    Logger.log(
      `NVIDIA Build returned no text content (finish_reason: ${firstChoice ? firstChoice.finish_reason : "none"}).`,
    );
    return "";
  } catch (err) {
    Logger.log(`NVIDIA Build response failed: ${err}`);
    return "";
  }
}
