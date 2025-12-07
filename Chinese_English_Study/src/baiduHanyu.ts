export { baiduHanyu, BaiduHanyuObject, PinyinObject, Definition, WordType };

/**
 * The Baidu Hanyu API response object.
 * "data" contains the definition of the word.
 */
class BaiduHanyuObject {
  pinyinList: Array<PinyinObject> = [];
  type: string = ""; // "term" | "idiom" | "other" | "unknown"
  name: string = ""; // word/idiom name

  constructor(
    pinyinList: Array<PinyinObject> = [],
    type: string = "",
    name: string = ""
  ) {
    this.pinyinList = pinyinList;
    this.type = type;
    this.name = name;
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
  pinyin: string = "";
  definitionList: Array<Definition> = []; // Definition could be multiple
  isCommon: boolean = true;

  constructor(
    pinyin: string = "",
    definitionList: Array<Definition> = [],
    isCommon: boolean = true
  ) {
    this.pinyin = pinyin;
    this.definitionList = definitionList;
    this.isCommon = isCommon;
  }

  /**
   * Retrieves the definition of the object.
   *
   * @returns The definition as a string.
   */
  getFormattedDefinition(): string {
    let result = "";

    for (let i = 0; i < this.definitionList.length; i++) {
      // add ①, ②, ③, ... before each definition if there are multiple definitions
      const prefixSymbol =
        this.definitionList.length == 1
          ? ""
          : String.fromCharCode(parseInt((2460 + i).toString(), 16));
      result += `\n${prefixSymbol}${this.definitionList[
        i
      ].getFormattedDefinitionAndExample()}`;
    }
    return result.trim();
  }

  /**
   * Converts an array of strings into a formatted string.
   *
   * @param list - The array of strings to convert.
   * @returns The formatted string.
   */
  listToString(list: Array<string>): string {
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

class Definition {
  definition: string = "";
  lijuList: Array<string> = []; // Every signal definition could have multiple example sentences
  cixingList: Array<string> = []; // Every signal definition could have multiple cixing e.g. "名词, 动词"

  constructor(
    definition: string = "",
    lijuList: Array<string> = [],
    cixingList: Array<string> = []
  ) {
    this.definition = definition;
    this.lijuList = lijuList;
    this.cixingList = cixingList;
  }

  /**
   * Retrieves the definition of the object.
   *
   * @returns The definition as a string.
   */
  getFormattedDefinitionAndExample(): string {
    let result = "";

    const cixing =
      this.cixingList.length > 0
        ? `【${this.cixingList.join("").replace("词", "")}】`
        : "";
    result += `${cixing}${this.definition}`;

    // add example sentences after definition
    if (this.lijuList.length == 0 || this.lijuList[0].length == 0)
      return result;
    const shortestExample = this.lijuList.sort(
      (a, b) => a.length - b.length
    )[0];
    result += `\n　▷例：${shortestExample}`;
    return result;
  }
}

// Temporary endpoints; user will provide final URLs later
const BAIDU_HANYU_ENDPOINTS = {
  word: (wd: string) =>
    `https://hanyuapp.baidu.com/dictapp/swan/termdetail?wd=${wd}&source_tag=2`,
  character: (wd: string) =>
    `https://hanyuapp.baidu.com/dictapp/word/detail_getworddetail?wd=${wd}&smp_names=wordNewData1`,
};

/**
 * Retrieves the definition of a word from the Baidu Hanyu API.
 * If the API returns no results, it falls back to the Baidu Hanyu Web.
 * @param word - The word to retrieve the definition for.
 * @returns The BaiduHanyuObject containing the definition of the word.
 */
function baiduHanyu(word: string): BaiduHanyuObject {
  Logger.log("baiduHanyu start");
  // Try idiom API first, then character API; merge if needed
  if (word.length === 1) {
    const charObj = baiduHanyuApiFetchCharacter(word);
    if (charObj.pinyinList.length > 0) return charObj;
  }

  const wordObj = baiduHanyuApiFetchWord(word);
  if (wordObj.pinyinList.length > 0) return wordObj;

  return new BaiduHanyuObject();
}

/**
 * Retrieves the definition of a word from the Baidu Hanyu API.
 *
 * @param word - The word to retrieve the definition for.
 * @returns The BaiduHanyuObject containing the definition of the word.
 */
function baiduHanyuApiFetchWord(word: string): BaiduHanyuObject {
  Logger.log("baiduHanyuApiFetchWord start");
  const url = BAIDU_HANYU_ENDPOINTS.word(word);
  let res: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    res = UrlFetchApp.fetch(url);
  } catch (e) {
    Logger.log(`word fetch failed: ${e}`);
    return new BaiduHanyuObject();
  }
  if (res.getResponseCode() != 200) return new BaiduHanyuObject();

  const parsed = JSON.parse(res.getContentText());
  const data = parsed.data;
  if (!data) return new BaiduHanyuObject();
  if (data.type !== WordType.idiom && data.type !== WordType.term)
    return new BaiduHanyuObject();

  const obj = new BaiduHanyuObject();
  obj.type = data.type;
  obj.name = data.name || "";
  if (data.type === WordType.idiom) {
    handleIdiomType(data, obj);
  } else {
    handleTermType(data, obj);
  }
  return obj;
}

function baiduHanyuApiFetchCharacter(word: string): BaiduHanyuObject {
  Logger.log("baiduHanyuApiFetchCharacter start");
  const url = BAIDU_HANYU_ENDPOINTS.character(word);
  let res: GoogleAppsScript.URL_Fetch.HTTPResponse;
  try {
    res = UrlFetchApp.fetch(url);
  } catch (e) {
    Logger.log(`character fetch failed: ${e}`);
    return new BaiduHanyuObject();
  }
  if (res.getResponseCode() != 200) return new BaiduHanyuObject();

  const parsed = JSON.parse(res.getContentText());
  const data = parsed.data;
  const obj = new BaiduHanyuObject();

  // word.json structure: data.detail holds character info
  if (data && data.detail) {
    obj.type = WordType.character;
    obj.name = data.detail.name || "";
    const compDefs = data.detail.comprehensiveDefinition || [];
    const pinyinList: Array<string> = [];

    compDefs.forEach((cd: any) => {
      let pinyin = cd.pinyin || cd.name || "";
      if (pinyin) pinyinList.push(pinyin);

      // Prefer basicDefinition when present, else detailDefinition
      const defsSrc: Array<any> =
        cd.basicDefinition && cd.basicDefinition.length > 0
          ? cd.basicDefinition
          : cd.detailDefinition || [];

      const definitions: Array<Definition> = [];
      defsSrc.forEach((d: any) => {
        const lijuList =
          d && d.liju ? d.liju.map((x: { name: string }) => x.name) : [];
        definitions.push(new Definition(d.definition, lijuList, d.cixing));
      });
      obj.pinyinList.push(new PinyinObject(pinyin, definitions, cd.bolCommon));
    });
  }

  return obj;
}

function handleTermType(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleTermType start.");
  if (!data.sid) {
    baiduHanyu.type = WordType.baike;
    handleTermBaiduBaike(data, baiduHanyu);
    return;
  }

  data.comprehensiveDefinition.forEach((comprehensiveDefinition: any) => {
    const pinyin = comprehensiveDefinition.pinyin;
    // try to get basicDefinition first
    // if basicDefinition is empty, get detailDefinition
    const definitionList =
      comprehensiveDefinition.basicDefinition.length > 0
        ? comprehensiveDefinition.basicDefinition
        : comprehensiveDefinition.detailDefinition;

    const definitions: Array<Definition> = [];
    definitionList.forEach((d: any) => {
      const lijuList = (d.liju || []).map((x: { name: string }) => x.name);
      definitions.push(new Definition(d.definition, lijuList, d.cixing));
    });
    baiduHanyu.pinyinList.push(new PinyinObject(pinyin, definitions));
  });
}

function handleTermBaiduBaike(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleTermBaiduBaike start.");
  const dataBaiduBaike = data.baikeInfo;
  if (!dataBaiduBaike || dataBaiduBaike.baikeMean == "") return;

  baiduHanyu.pinyinList.push(
    new PinyinObject("", [new Definition(dataBaiduBaike.baikeMean)])
  );
}

function handleIdiomType(data: any, baiduHanyu: BaiduHanyuObject): void {
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
    definitionInfo.detailMeans.forEach((detailMean: any) => {
      definition += `\n　${detailMean.word}：${detailMean.definition}`;
    });
  }

  // add example sentences
  const lijuList = data.liju.map((x: { name: string }) => x.name);

  baiduHanyu.pinyinList.push(
    new PinyinObject(data.pinyin, [new Definition(definition, lijuList)])
  );
}
