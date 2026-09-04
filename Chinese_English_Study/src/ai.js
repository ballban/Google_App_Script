"use strict";

const DEFAULT_AI_PROVIDER = "openrouter";

function getAiProvider(providerName = DEFAULT_AI_PROVIDER) {
  switch (providerName) {
    case "openrouter":
      return getOpenRouterProvider();
    default:
      Logger.log(`Unknown AI provider: ${providerName}`);
      return null;
  }
}

function buildAiRequest(word, providerName = DEFAULT_AI_PROVIDER) {
  const provider = getAiProvider(providerName);
  return provider == null ? null : provider.buildRequest(word);
}

function parseAiResponse(response, providerName = DEFAULT_AI_PROVIDER) {
  const provider = getAiProvider(providerName);
  return provider == null ? "" : provider.parseResponse(response);
}

function getAiRequestOptions(request) {
  const options = {
    muteHttpExceptions: request.muteHttpExceptions,
  };
  if (request.method) options.method = request.method;
  if (request.headers) options.headers = request.headers;
  if (request.payload !== undefined) options.payload = request.payload;
  return options;
}

function createAiHanyuObject(
  word,
  definition,
  providerName = DEFAULT_AI_PROVIDER,
) {
  if (typeof definition !== "string" || definition.trim() === "") {
    return new BaiduHanyuObject();
  }

  const provider = getAiProvider(providerName);
  if (provider == null) return new BaiduHanyuObject();

  const result = new BaiduHanyuObject(
    [],
    WordType.term,
    typeof word === "string" ? word.trim() : "",
    provider.displayName,
  );
  result.pinyinList.push(
    new PinyinObject("", [new Definition(definition.trim())], true),
  );
  return result;
}

function ai(word, providerName = DEFAULT_AI_PROVIDER) {
  Logger.log("ai start.");
  const request = buildAiRequest(word, providerName);
  if (request == null) return new BaiduHanyuObject();

  try {
    const response = UrlFetchApp.fetch(
      request.url,
      getAiRequestOptions(request),
    );
    const definition = parseAiResponse(response, providerName);
    return convertChineseDefinitionToSimplified(
      createAiHanyuObject(word, definition, providerName),
    );
  } catch (err) {
    Logger.log(`AI fetch failed: ${err}`);
    return new BaiduHanyuObject();
  }
}
