"use strict";

/**
 * The Baidu Hanyu API response object.
 * "data" contains the definition of the word.
 */
class BaiduHanyuObject {
  constructor(pinyinList = [], type = "", name = "", source = "") {
    this.pinyinList = [];
    this.type = ""; // "term" | "idiom" | "other" | "unknown"
    this.name = ""; // word/idiom name
    this.source = ""; // "Baidu Hanyu" | "Moedict" | AI provider displayName
    this.pinyinList = pinyinList;
    this.type = type;
    this.name = name;
    this.source = source;
  }
}

const WordType = {
  term: "term",
  idiom: "idiom",
  character: "character",
  baike: "baike",
  hot_words: "hot_words",
  unknown: "unknown",
};

class PinyinObject {
  constructor(pinyin = "", definitionList = [], isCommon = true) {
    this.pinyin = "";
    this.definitionList = []; // Definition could be multiple
    this.isCommon = true;
    this.pinyin = pinyin;
    this.definitionList = definitionList;
    this.isCommon = isCommon;
  }
  /**
   * Retrieves the definition of the object.
   *
   * @returns The definition as a string.
   */
  getFormattedDefinition() {
    let result = "";
    for (let i = 0; i < this.definitionList.length; i++) {
      // add ①, ②, ③, ... before each definition if there are multiple definitions
      const prefixSymbol =
        this.definitionList.length == 1 ? "" : getDefinitionNumber(i);
      result += `\n${prefixSymbol}${this.definitionList[i].getFormattedDefinitionAndExample()}`;
    }
    return result.trim();
  }
  /**
   * Converts an array of strings into a formatted string.
   *
   * @param list - The array of strings to convert.
   * @returns The formatted string.
   */
  listToString(list) {
    if (list.length == 0) return "";
    else if (list.length == 1) return `\n    ${list[0]}`;
    else {
      let result = "";
      for (let i = 0; i < list.length; i++) {
        result += `\n    ${i + 1}. ${list[i]}`;
      }
      return result;
    }
  }
}

// Unicode circled numbers stop at ⑳ (U+2473).
function getDefinitionNumber(index) {
  return index < 20 ? String.fromCharCode(0x2460 + index) : `(${index + 1})`;
}

class Definition {
  constructor(definition = "", lijuList = [], cixingList = []) {
    this.definition = "";
    this.lijuList = []; // Every signal definition could have multiple example sentences
    this.cixingList = []; // Every signal definition could have multiple cixing e.g. "名词, 动词"
    this.definition = definition;
    this.lijuList = lijuList;
    this.cixingList = cixingList;
  }
  /**
   * Retrieves the definition of the object.
   *
   * @returns The definition as a string.
   */
  getFormattedDefinitionAndExample() {
    let result = "";
    const cixing =
      this.cixingList.length > 0
        ? `【${this.cixingList.map((cixing) => String(cixing).replace(/词/g, "")).join("、")}】`
        : "";
    result += `${cixing}${this.definition}`;
    // add example sentences after definition
    if (this.lijuList.length == 0 || this.lijuList[0].length == 0) return result;
    const shortestExample = this.lijuList.sort((a, b) => a.length - b.length)[0];
    result += `\n　▷例：${shortestExample}`;
    return result;
  }
}

// Moedict and AI results are labeled in the sheet and converted to Simplified.
function isFallbackChineseSource(source) {
  return typeof source === "string" && source !== "" && source !== "Baidu Hanyu";
}

function hasChineseDefinition(baiduHanyuObject) {
  if (!baiduHanyuObject || !Array.isArray(baiduHanyuObject.pinyinList)) {
    return false;
  }

  return baiduHanyuObject.pinyinList.some(
    (pinyinObject) =>
      pinyinObject &&
      Array.isArray(pinyinObject.definitionList) &&
      pinyinObject.definitionList.some(
        (definition) =>
          definition &&
          typeof definition.definition === "string" &&
          definition.definition.trim() !== "",
      ),
  );
}

// Temporary endpoints; user will provide final URLs later
const BAIDU_HANYU_ENDPOINTS = {
  word: (wd) =>
    `https://hanyuapp.baidu.com/dictapp/swan/termdetail?wd=${encodeURIComponent(wd)}&source_tag=2`,
  character: (wd) =>
    `https://hanyuapp.baidu.com/dictapp/word/detail_getworddetail?wd=${encodeURIComponent(wd)}&smp_names=wordNewData1`,
};

const BAIDU_FETCH_OPTIONS = {
  muteHttpExceptions: true,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
};

/**
 * Retrieves the definition of a word from the Baidu Hanyu API.
 * If the API returns no results, it falls back to the Baidu Hanyu Web.
 * @param word - The word to retrieve the definition for.
 * @returns The BaiduHanyuObject containing the definition of the word.
 */
function baiduHanyu(word) {
  Logger.log("baiduHanyu start");
  if (typeof word !== "string") {
    Logger.log("baiduHanyu skipped non-text input.");
    return new BaiduHanyuObject();
  }
  word = word.trim();
  if (word === "") return new BaiduHanyuObject();

  // Try idiom API first, then character API; merge if needed
  if (word.length === 1) {
    const charObj = baiduHanyuApiFetchCharacter(word);
    if (hasChineseDefinition(charObj)) return charObj;
  }
  const wordObj = baiduHanyuApiFetchWord(word);
  if (hasChineseDefinition(wordObj)) return wordObj;

  const moedictObj = moedict(word);
  if (hasChineseDefinition(moedictObj)) return moedictObj;
  return ai(word);
}

/**
 * Builds a Baidu Hanyu request for a word or character lookup.
 *
 * @param word - The word to retrieve the definition for.
 * @param kind - Either "word" or "character".
 * @returns A UrlFetchApp request object.
 */
function buildBaiduHanyuRequest(word, kind) {
  const endpoint = kind === "character"
    ? BAIDU_HANYU_ENDPOINTS.character
    : BAIDU_HANYU_ENDPOINTS.word;
  return {
    url: endpoint(word),
    muteHttpExceptions: BAIDU_FETCH_OPTIONS.muteHttpExceptions,
    headers: BAIDU_FETCH_OPTIONS.headers,
  };
}

function parseBaiduHanyuWordResponse(res) {
  try {
    const wordResponseCode = res.getResponseCode();
    if (wordResponseCode != 200) {
      Logger.log(`word fetch failed: HTTP ${wordResponseCode}`);
      return new BaiduHanyuObject();
    }

    const parsed = JSON.parse(res.getContentText());
    const data = parsed.data;
    if (!data) return new BaiduHanyuObject();
    if (data.type !== WordType.idiom && data.type !== WordType.term) {
      return new BaiduHanyuObject();
    }

    const obj = new BaiduHanyuObject();
    obj.source = "Baidu Hanyu";
    obj.type = data.type;
    obj.name = data.name || "";
    if (data.type === WordType.idiom) {
      handleIdiomType(data, obj);
    } else {
      handleTermType(data, obj);
    }
    return obj;
  } catch (e) {
    Logger.log(`word response failed: ${e}`);
    return new BaiduHanyuObject();
  }
}

function parseBaiduHanyuCharacterResponse(res) {
  try {
    const charResponseCode = res.getResponseCode();
    if (charResponseCode != 200) {
      Logger.log(`character fetch failed: HTTP ${charResponseCode}`);
      return new BaiduHanyuObject();
    }

    const parsed = JSON.parse(res.getContentText());
    const data = parsed.data;
    const obj = new BaiduHanyuObject();
    // word.json structure: data.detail holds character info
    if (data && data.detail) {
      obj.source = "Baidu Hanyu";
      obj.type = WordType.character;
      obj.name = data.detail.name || "";
      const compDefs = data.detail.comprehensiveDefinition || [];
      compDefs.forEach((cd) => {
        let pinyin = cd.pinyin || cd.name || "";
        // Prefer basicDefinition when present, else detailDefinition
        const defsSrc =
          cd.basicDefinition && cd.basicDefinition.length > 0
            ? cd.basicDefinition
            : cd.detailDefinition || [];
        const definitions = [];
        defsSrc.forEach((d) => {
          const lijuList = d && d.liju ? d.liju.map((x) => x.name) : [];
          definitions.push(new Definition(d.definition, lijuList, d.cixing));
        });
        obj.pinyinList.push(new PinyinObject(pinyin, definitions, cd.bolCommon));
      });
    }
    return obj;
  } catch (e) {
    Logger.log(`character response failed: ${e}`);
    return new BaiduHanyuObject();
  }
}

function baiduHanyuApiFetchWord(word) {
  Logger.log("baiduHanyuApiFetchWord start");
  const request = buildBaiduHanyuRequest(word, "word");
  try {
    return parseBaiduHanyuWordResponse(
      UrlFetchApp.fetch(request.url, BAIDU_FETCH_OPTIONS),
    );
  } catch (e) {
    Logger.log(`word fetch failed: ${e}`);
    return new BaiduHanyuObject();
  }
}

function baiduHanyuApiFetchCharacter(word) {
  Logger.log("baiduHanyuApiFetchCharacter start");
  const request = buildBaiduHanyuRequest(word, "character");
  try {
    return parseBaiduHanyuCharacterResponse(
      UrlFetchApp.fetch(request.url, BAIDU_FETCH_OPTIONS),
    );
  } catch (e) {
    Logger.log(`character fetch failed: ${e}`);
    return new BaiduHanyuObject();
  }
}

function handleTermType(data, baiduHanyu) {
  Logger.log("handleTermType start.");
  if (!data.sid) {
    baiduHanyu.type = WordType.baike;
    handleTermBaiduBaike(data, baiduHanyu);
    return;
  }
  data.comprehensiveDefinition.forEach((comprehensiveDefinition) => {
    const pinyin = comprehensiveDefinition.pinyin;
    // try to get basicDefinition first
    // if basicDefinition is empty, get detailDefinition
    const definitionList =
      comprehensiveDefinition.basicDefinition.length > 0
        ? comprehensiveDefinition.basicDefinition
        : comprehensiveDefinition.detailDefinition;
    const definitions = [];
    definitionList.forEach((d) => {
      const lijuList = (d.liju || []).map((x) => x.name);
      definitions.push(new Definition(d.definition, lijuList, d.cixing));
    });
    baiduHanyu.pinyinList.push(new PinyinObject(pinyin, definitions));
  });
}

function handleTermBaiduBaike(data, baiduHanyu) {
  Logger.log("handleTermBaiduBaike start.");
  const dataBaiduBaike = data.baikeInfo;
  if (!dataBaiduBaike || dataBaiduBaike.baikeMean == "") return;
  baiduHanyu.pinyinList.push(new PinyinObject("", [new Definition(dataBaiduBaike.baikeMean)]));
}

function handleIdiomType(data, baiduHanyu) {
  Logger.log("handleIdiomType start.");
  const definitionInfo = data.definitionInfo;
  let definition = definitionInfo.definition;
  if (definitionInfo.ancientDefinition) {
    definition += `\n${definitionInfo.ancientDefinition}`;
  }
  if (definitionInfo.modernDefinition) {
    definition += `\n${definitionInfo.modernDefinition}`;
  }
  if (definitionInfo.detailMeans) {
    definitionInfo.detailMeans.forEach((detailMean) => {
      definition += `\n　${detailMean.word}：${detailMean.definition}`;
    });
  }
  // add example sentences
  const lijuList = data.liju.map((x) => x.name);
  baiduHanyu.pinyinList.push(new PinyinObject(data.pinyin, [new Definition(definition, lijuList)]));
}
