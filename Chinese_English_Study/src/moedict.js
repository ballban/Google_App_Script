"use strict";

const MOEDICT_ENDPOINTS = {
  dictionary: (word) =>
    `https://www.moedict.tw/uni/${encodeURIComponent(word)}`,
  convertToTraditional: (word) =>
    `https://api.zhconvert.org/convert?converter=Traditional&text=${encodeURIComponent(word)}`,
};

const MOEDICT_FETCH_OPTIONS = {
  muteHttpExceptions: true,
  headers: {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
};

function buildMoedictRequest(word) {
  if (typeof word !== "string" || word.trim() === "") return null;

  const normalizedWord = word.trim();
  return {
    url: MOEDICT_ENDPOINTS.dictionary(normalizedWord),
    muteHttpExceptions: MOEDICT_FETCH_OPTIONS.muteHttpExceptions,
    headers: MOEDICT_FETCH_OPTIONS.headers,
  };
}

function buildMoedictTraditionalRequest(word) {
  if (typeof word !== "string" || word.trim() === "") return null;

  const normalizedWord = word.trim();
  return {
    url: MOEDICT_ENDPOINTS.convertToTraditional(normalizedWord),
    muteHttpExceptions: MOEDICT_FETCH_OPTIONS.muteHttpExceptions,
    headers: MOEDICT_FETCH_OPTIONS.headers,
  };
}

function buildSimplifiedTextRequest(text) {
  if (typeof text !== "string" || text === "") return null;

  return {
    url: "https://api.zhconvert.org/convert",
    method: "post",
    headers: {
      ...MOEDICT_FETCH_OPTIONS.headers,
      "Content-Type": "application/json",
    },
    payload: JSON.stringify({
      text,
      converter: "Simplified",
    }),
    muteHttpExceptions: MOEDICT_FETCH_OPTIONS.muteHttpExceptions,
  };
}

function parseMoedictResponse(response, input = "") {
  try {
    if (!response || response.getResponseCode() !== 200) {
      const responseCode = response ? response.getResponseCode() : 0;
      Logger.log(`Moedict failed: HTTP ${responseCode}`);
      return new BaiduHanyuObject();
    }

    const data = JSON.parse(response.getContentText());
    if (!data || !Array.isArray(data.heteronyms)) {
      return new BaiduHanyuObject();
    }

    const lookupWord = typeof input === "string" ? input : "";
    const type =
      Array.from(lookupWord).length === 1 ? WordType.character : WordType.term;
    const obj = new BaiduHanyuObject([], type, data.title || lookupWord);
    obj.source = "Moedict";

    data.heteronyms.forEach((heteronym) => {
      if (!heteronym || typeof heteronym !== "object") return;

      const definitions = Array.isArray(heteronym.definitions)
        ? heteronym.definitions
            .filter(
              (definition) =>
                definition && typeof definition.def === "string",
            )
            .map((definition) => {
              const examples = Array.isArray(definition.example)
                ? definition.example.filter(
                    (example) =>
                      typeof example === "string" && example.trim() !== "",
                  )
                : typeof definition.example === "string" &&
                    definition.example.trim() !== ""
                  ? [definition.example]
                  : [];
              return new Definition(definition.def, examples);
            })
        : [];
      const pinyin = Array.isArray(heteronym.pinyin)
        ? heteronym.pinyin.join(" ").trim()
        : typeof heteronym.pinyin === "string"
          ? heteronym.pinyin.trim()
          : "";

      if (pinyin !== "" || definitions.length > 0) {
        obj.pinyinList.push(new PinyinObject(pinyin, definitions, true));
      }
    });

    const hasUsefulEntry = obj.pinyinList.some(
      (pinyinObject) =>
        pinyinObject.pinyin !== "" ||
        pinyinObject.definitionList.some(
          (definition) =>
            definition.definition !== "" &&
            !definition.definition.includes("\u7570\u9ad4\u5b57"),
        ),
    );
    return hasUsefulEntry ? obj : new BaiduHanyuObject();
  } catch (err) {
    Logger.log(`Moedict response failed: ${err}`);
    return new BaiduHanyuObject();
  }
}

function parseMoedictConversionResponse(response, label) {
  try {
    if (!response || response.getResponseCode() !== 200) {
      const responseCode = response ? response.getResponseCode() : 0;
      Logger.log(`${label} failed: HTTP ${responseCode}`);
      return "";
    }

    const data = JSON.parse(response.getContentText());
    if (typeof data.code === "number" && data.code !== 0) return "";

    const convertedText = data.data && data.data.text;
    return typeof convertedText === "string" ? convertedText.trim() : "";
  } catch (err) {
    Logger.log(`${label} response failed: ${err}`);
    return "";
  }
}

function parseMoedictTraditionalResponse(response) {
  return parseMoedictConversionResponse(response, "Traditional conversion");
}

function parseSimplifiedTextResponse(response) {
  return parseMoedictConversionResponse(response, "Simplified conversion");
}

function getChineseDefinitionTextSlots(baiduHanyuObject) {
  const slots = [];
  if (!baiduHanyuObject || !Array.isArray(baiduHanyuObject.pinyinList)) {
    return slots;
  }

  baiduHanyuObject.pinyinList.forEach((pinyinObject) => {
    if (!pinyinObject || !Array.isArray(pinyinObject.definitionList)) return;

    pinyinObject.definitionList.forEach((definition) => {
      if (!definition || typeof definition.definition !== "string") return;
      slots.push({
        target: definition,
        field: "definition",
        value: definition.definition,
      });

      if (!Array.isArray(definition.lijuList)) return;
      definition.lijuList.forEach((example, index) => {
        if (typeof example !== "string") return;
        slots.push({
          target: definition.lijuList,
          index,
          value: example,
        });
      });
    });
  });
  return slots;
}

function applySimplifiedText(baiduHanyuObject, convertedText) {
  const slots = getChineseDefinitionTextSlots(baiduHanyuObject);
  if (slots.length === 0) return true;

  let convertedValues;
  try {
    convertedValues = JSON.parse(convertedText);
  } catch (err) {
    Logger.log(`Simplified conversion data failed: ${err}`);
    return false;
  }

  if (
    !Array.isArray(convertedValues) ||
    convertedValues.length !== slots.length ||
    convertedValues.some((value) => typeof value !== "string")
  ) {
    Logger.log("Simplified conversion returned an unexpected value list.");
    return false;
  }

  slots.forEach((slot, index) => {
    if (slot.field) {
      slot.target[slot.field] = convertedValues[index];
    } else {
      slot.target[slot.index] = convertedValues[index];
    }
  });
  return true;
}

function convertChineseDefinitionToSimplified(baiduHanyuObject) {
  const slots = getChineseDefinitionTextSlots(baiduHanyuObject);
  if (slots.length === 0) return baiduHanyuObject;

  const request = buildSimplifiedTextRequest(
    JSON.stringify(slots.map((slot) => slot.value)),
  );
  if (request == null) return baiduHanyuObject;

  try {
    const convertedText = parseSimplifiedTextResponse(
      UrlFetchApp.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        payload: request.payload,
        muteHttpExceptions: request.muteHttpExceptions,
      }),
    );
    applySimplifiedText(baiduHanyuObject, convertedText);
  } catch (err) {
    Logger.log(`Simplified conversion fetch failed: ${err}`);
  }
  return baiduHanyuObject;
}

function moedict(word) {
  const request = buildMoedictRequest(word);
  if (request == null) return new BaiduHanyuObject();

  try {
    let result = parseMoedictResponse(
      UrlFetchApp.fetch(request.url, MOEDICT_FETCH_OPTIONS),
      word,
    );
    if (result.pinyinList.length > 0) {
      return convertChineseDefinitionToSimplified(result);
    }

    const conversionRequest = buildMoedictTraditionalRequest(word);
    if (conversionRequest == null) return result;

    const traditionalWord = parseMoedictTraditionalResponse(
      UrlFetchApp.fetch(
        conversionRequest.url,
        MOEDICT_FETCH_OPTIONS,
      ),
    );
    if (traditionalWord === "" || traditionalWord === word) return result;

    result = parseMoedictResponse(
      UrlFetchApp.fetch(
        buildMoedictRequest(traditionalWord).url,
        MOEDICT_FETCH_OPTIONS,
      ),
      traditionalWord,
    );
    return convertChineseDefinitionToSimplified(result);
  } catch (err) {
    Logger.log(`Moedict fetch failed: ${err}`);
    return new BaiduHanyuObject();
  }
}
