/**
 * The Baidu Hanyu API response object.
 * "data" contains the definition of the word.
 */
class BaiduHanyuObject {
  definitionList: Array<ComprehensiveDefinitionObject> = [];
  type: string = "";
  termVersion: number = 0;
}

/**
 * The definition object containing the pinyin, definition, and example sentences.
 * "comprehensiveDefinition" contains the definition of the word.
 * each comprehensiveDefinition contains one "pinyin" and multiple "basicDefinition" or "detailDefinition".
 */
class ComprehensiveDefinitionObject {
  pinyin: string = "";
  definitionList: Array<string> = [];
  lijuList: Array<Array<string>> = [];

  constructor(
    pinyin: string = "",
    definitionList: Array<string> = [],
    lijuList: Array<Array<string>> = [[]]
  ) {
    this.pinyin = pinyin;
    this.definitionList = definitionList;
    this.lijuList = lijuList;
  }

  /**
   * Retrieves the definition of the object.
   *
   * @returns The definition as a string.
   */
  getDefinition(): string {
    let result = "";
    for (let i = 0; i < this.definitionList.length; i++) {
      // add ①, ②, ③, ... before each definition if there are multiple definitions
      result += `\n${
        this.definitionList.length == 1
          ? ""
          : String.fromCharCode(parseInt((2460 + i).toString(), 16))
      }${this.definitionList[i]}`;
      Logger.log(`i: ${i} \nresult: ${result}`);
      Logger.log(`this.definitionList: ${this.definitionList}`);

      if (this.lijuList.length == this.definitionList.length) {
        result += "\n例句:";
        result += this.listToString(this.lijuList[i]);
      } else if (
        this.lijuList[0] &&
        this.lijuList[0].length > 0 &&
        i == this.definitionList.length - 1
      ) {
        result += "\n例句:";
        result += this.listToString(this.lijuList[0]);
      }
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

const baiduHanyuApiType = {
  term: "term",
  idiom: "idiom",
  other: "other",
  hot_words: "hot_words",
  unknown: "unknown",
};

/**
 * Fetches the definition and pinyin of a word from Baidu Hanyu.
 *
 * @param word - The word to search for.
 * @param baiduHanyu - The BaiduHanyuObject to store the fetched data.
 * @returns void
 */
function baiduHanyuWeb(word: string, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("baiduHanyuWeb start.");
  const url = `https://dict.baidu.com/s?wd=${word}&ptype=zici`;

  const response = UrlFetchApp.fetch(url);
  if (response.getResponseCode() != 200) return;

  const contentText = extractContentText(response.getContentText());
  if (!contentText) return;

  const document = XmlService.parse(contentText.replace("&nbsp;", ""));
  const elements = document.getRootElement().getChildren("dl");

  if (elements.length < 1) return;

  const definitionList = extractDefinitions(elements);
  const pinyinList = extractPinyin(response.getContentText());

  if (pinyinList.length < 1) return;
  for (let i = 0; i < pinyinList.length; i++) {
    baiduHanyu.definitionList.push(
      new ComprehensiveDefinitionObject(pinyinList[i], [], [[]])
    );
  }
  baiduHanyu.definitionList[0].definitionList = definitionList;
}

function extractContentText(content: string): string | null {
  Logger.log("extractContentText start.");
  const pattern = /<div class="tab-content([\s\S]*?)">([\s\S]*?)<\/div>/;
  const match = content.match(pattern);
  return match ? match[0] : null;
}

function extractDefinitions(
  elements: Array<GoogleAppsScript.XML_Service.Element>
): Array<string> {
  const definitionList: Array<string> = [];
  for (const element of elements) {
    const definitions = element.getChild("dd").getChildren("p");
    for (const definition of definitions) {
      definitionList.push(definition.getValue().trim());
    }
  }
  return definitionList;
}

function extractPinyin(content: string): Array<string> {
  Logger.log("extractPinyin start.");
  const pattern = /<div([^<>]*?)id="pinyin">([^]*?)<\/div>/;
  const matchDiv = content.match(pattern);
  if (!matchDiv) return [];

  const div = matchDiv[0];
  const pinyinPattern = /t">([^]*?)<\/b>/g;
  const pinyinMatches = div.match(pinyinPattern);
  if (!pinyinMatches) return [];

  return pinyinMatches.map((pinyin) => {
    let cleanPinyin = pinyin.substring(3, pinyin.length - 4);
    if (cleanPinyin[0] == "[")
      cleanPinyin = cleanPinyin.substring(2, cleanPinyin.length - 2);
    return cleanPinyin;
  });
}

/**
 * Retrieves the definition of a word from the Baidu Hanyu API.
 * If the API returns no results, it falls back to the Baidu Hanyu Web.
 * @param word - The word to retrieve the definition for.
 * @returns The BaiduHanyuObject containing the definition of the word.
 */
function baiduHanyu(word: string): BaiduHanyuObject {
  Logger.log("baiduHanyuApi start.");
  const baiduHanyuObject = baiduHanyuApi(word);

  if (baiduHanyuObject.definitionList.length == 0) {
    Logger.log("try baiduHanyuWeb");
    baiduHanyuWeb(word, baiduHanyuObject);
    Logger.log("baiduHanyuWeb end");
    Logger.log(
      `baiduHanyuObject: ${baiduHanyuObject.definitionList.join(", ")}`
    );
  }

  return baiduHanyuObject;
}

/**
 * Retrieves the definition of a word from the Baidu Hanyu API.
 *
 * @param word - The word to retrieve the definition for.
 * @returns The BaiduHanyuObject containing the definition of the word.
 */
function baiduHanyuApi(word: string): BaiduHanyuObject {
  Logger.log("baiduHanyuApi request start.");
  const url = `https://hanyuapp.baidu.com/dictapp/swan/termdetail?wd=${word}&ptype=zici&source_tag=2`;
  const res = UrlFetchApp.fetch(url);
  if (res.getResponseCode() != 200) return new BaiduHanyuObject();

  const data = JSON.parse(res.getContentText()).data;
  const baiduHanyu = new BaiduHanyuObject();
  baiduHanyu.type = data.type;

  switch (data.type) {
    case baiduHanyuApiType.term:
      handleTermType(data, baiduHanyu);
      break;
    case baiduHanyuApiType.idiom:
      handleIdiomType(data, baiduHanyu);
      break;
    case baiduHanyuApiType.other:
      baiduHanyu.definitionList.push(
        new ComprehensiveDefinitionObject("", ["Other type"], [[]])
      );
      break;
    case baiduHanyuApiType.hot_words:
      break;
    default:
      Logger.log(`Unknown dataType: ${data.type}`);
      baiduHanyu.definitionList.push(
        new ComprehensiveDefinitionObject("", [""], [[]])
      );
      baiduHanyu.type = baiduHanyuApiType.unknown;
      break;
  }
  return baiduHanyu;
}

function handleTermType(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleTermType start.");
  if (!data.sid) {
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

    let resultDefinition: Array<string> = [];
    let resultLiju = [[]];
    definitionList.forEach((definition: any) => {
      resultDefinition.push(definition.definition);
      const liju = definition.liju.map((x: { name: string }) => x.name);
      resultLiju.push(liju);
    });
    baiduHanyu.definitionList.push(
      new ComprehensiveDefinitionObject(pinyin, resultDefinition, resultLiju)
    );
  });
}

function handleTermBaiduBaike(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleTermBaiduBaike start.");
  const dataBaiduBaike = data.baikeInfo;
  if (!dataBaiduBaike || dataBaiduBaike.baikeMean == "") return;

  baiduHanyu.definitionList.push(
    new ComprehensiveDefinitionObject("", [dataBaiduBaike.baikeMean], [[]])
  );
}

function handleIdiomType(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleIdiomType start.");
  const definitionData = data.definitionInfo;
  let definition = definitionData.definition;
  if (data.ancientDefinition) {
    definition += `\n${definitionData.ancientDefinition}`;
  }
  if (data.modernDefinition) {
    definition += `\n${definitionData.modernDefinition}`;
  }
  baiduHanyu.definitionList.push(
    new ComprehensiveDefinitionObject(data.pinyin, [definition], [[]])
  );

  if (baiduHanyu.definitionList.length > 0) {
    const lijuList = data.liju.map((x: { name: string }) => x.name);
    baiduHanyu.definitionList[0].lijuList = [lijuList];
  }
}

function handleIdiomTypeVer2(data: any, baiduHanyu: BaiduHanyuObject): void {
  Logger.log("handleIdiomTypeVer2 start.");
  let definition = data.definitionInfo.definition;
  const dataDetailMeans = data.definitionInfo.detailMeans;
  for (let i = 0; i < dataDetailMeans.length; i++) {
    definition += `\n    ${dataDetailMeans[i].word}: ${dataDetailMeans[i].definition}`;
  }

  const liju = data.liju.map((x: { name: string }) => x.name);

  baiduHanyu.definitionList.push(
    new ComprehensiveDefinitionObject(data.pinyin, [definition], [liju])
  );
}
