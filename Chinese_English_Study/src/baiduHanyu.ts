class BaiduHanyuObject {
  definitionList: Array<DefinitionObject> = [];
  type: string = "";
}

class DefinitionObject {
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
      result += `\n${
        this.definitionList.length == 1
          ? ""
          : String.fromCharCode(parseInt((2460 + i).toString(), 16))
      }${this.definitionList[i]}`;
      if (this.lijuList[i].length > 0) {
        result += "\n例句:";
        result += this.listToString(this.lijuList[i]);
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
};

/**
 * Fetches the definition and pinyin of a word from Baidu Hanyu.
 *
 * @param word - The word to search for.
 * @param baiduHanyu - The BaiduHanyuObject to store the fetched data.
 * @returns void
 */
function baiduHanyuWeb(word: string, baiduHanyu: BaiduHanyuObject): void {
  let url = `https://dict.baidu.com/s?wd=${word}&ptype=zici`;

  let response = UrlFetchApp.fetch(url);
  if (response.getResponseCode() != 200) return;

  let pattern = /<div class="tab-content([\s\S]*?)">([\s\S]*?)<\/div>/;
  let contentText = response.getContentText().match(pattern);
  if (!contentText) return;

  // get definitions
  // parse to xml and get [dl] element list
  let document = XmlService.parse(contentText[0].replace("&nbsp;", ""));
  let elements = document.getRootElement().getChildren("dl");

  // If definition doesn't exist
  if (elements.length < 1) return;

  // Get definition List
  const definitionList = [];
  for (let i = 0; i < elements.length; i++) {
    let element = elements[i];

    let definitions = element.getChild("dd").getChildren("p");
    for (let j = 0; j < definitions.length; j++) {
      definitionList.push(definitions[j].getValue().trim());
    }
  }

  // get pinyin fuck you xml service.parse
  // get div
  let pinyinList = [];
  pattern = /<div([^<>]*?)id="pinyin">([^]*?)<\/div>/;
  let matchDiv = response.getContentText().match(pattern);
  if (!matchDiv) return;
  let div = matchDiv[0];

  Logger.log(contentText);

  // get pinyin
  pattern = /t">([^]*?)<\/b>/g;
  contentText = div.match(pattern);
  if (!contentText) return;

  for (let i = 0; i < contentText.length; i++) {
    let pinyin = contentText[i].substring(3, contentText[i].length - 4);
    if (pinyin[0] == "[") pinyin = pinyin.substring(2, pinyin.length - 2);
    pinyinList.push(pinyin);
  }

  // Generate baiduHanyuObject
  if (pinyinList.length < 1) return;
  for (let i = 0; i <= pinyinList.length; i++) {
    baiduHanyu.definitionList.push(
      new DefinitionObject(pinyinList[i], [], [[]])
    );
  }
  baiduHanyu.definitionList[0].definitionList = definitionList;
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

  // Try baiduHanyuWeb if baiduHanyuApi returns nothing
  Logger.log(
    `baiduHanyuObject.definitionList.length: ${baiduHanyuObject.definitionList.length}`
  );
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
  const url = `https://hanyuapp.baidu.com/dictapp/swan/termdetail?wd=${word}&ptype=zici&source_tag=2`;
  Logger.log("baiduHanyuApi request");
  const res = UrlFetchApp.fetch(url);
  if (res.getResponseCode() != 200) return new BaiduHanyuObject();

  Logger.log("parse data");
  const data = JSON.parse(res.getContentText()).data;
  const baiduHanyu = new BaiduHanyuObject();

  const dataType = data.type;
  let dataTypeVer = "";
  Logger.log(`dataType: ${dataType}`);
  switch (dataType) {
    case baiduHanyuApiType.term:
      dataTypeVer = data.termVersion;
      if (dataTypeVer) baiduHanyuApiTypeTermVer2(data, baiduHanyu);
      else baiduHanyuApiTypeTerm(data, baiduHanyu);
      baiduHanyu.type = baiduHanyuApiType.term;
      break;
    case baiduHanyuApiType.idiom:
      dataTypeVer = data.idiomVersion;
      if (dataTypeVer) baiduHanyuApiTypeIdiomVer2(data, baiduHanyu);
      else baiduHanyuApiTypeIdiom(data, baiduHanyu);
      baiduHanyu.type = baiduHanyuApiType.idiom;
      break;
    // for those definitions that I don't know
    default:
      baiduHanyu.definitionList.push(
        new DefinitionObject("", ["Unknown type"], [[]])
      );
      baiduHanyu.type = baiduHanyuApiType.other;
      return baiduHanyu;
  }
  return baiduHanyu;
}

function baiduHanyuApiTypeTerm(data: any, baiduHanyu: BaiduHanyuObject): void {
  const dataBaiduBaike = data.baikeInfo;
  if (!dataBaiduBaike || dataBaiduBaike.baikeMean == "") return;

  baiduHanyu.definitionList.push(
    new DefinitionObject("", [dataBaiduBaike.baikeMean], [[]])
  );
}

function baiduHanyuApiTypeTermVer2(
  data: any,
  baiduHanyu: BaiduHanyuObject
): void {
  let dataComprehensiveDefinition = data.comprehensiveDefinition;

  // Loop comprehensiveDefinition
  Logger.log("Loop comprehensiveDefinition");
  for (let i = 0; i < dataComprehensiveDefinition.length; i++) {
    const definition = new DefinitionObject();
    definition.pinyin = dataComprehensiveDefinition[i].pinyin;

    // Loop basicDefinition
    Logger.log(`Loop basicDefinition: ${i}`);
    const dataBasicDefinition = dataComprehensiveDefinition[i].basicDefinition;
    for (let j = 0; j < dataBasicDefinition.length; j++) {
      definition.definitionList.push(dataBasicDefinition[j].definition);

      definition.lijuList.push(
        dataBasicDefinition[j].liju.map((x: { name: string }) => x.name)
      );
    }
    baiduHanyu.definitionList.push(definition);
  }
}

function baiduHanyuApiTypeIdiom(data: any, baiduHanyu: BaiduHanyuObject): void {
  const dataDefinitionRoot = data.definition;
  for (let i = 0; i < dataDefinitionRoot.length; i++) {
    baiduHanyu.definitionList.push(
      new DefinitionObject(
        dataDefinitionRoot[i].pinyin,
        [dataDefinitionRoot[i].definition],
        [[]]
      )
    );
  }

  if (baiduHanyu.definitionList.length > 0) {
    const lijuList = data.zaoJu.map((x: { name: string }) => x.name);
    baiduHanyu.definitionList[0].lijuList = [lijuList];
  }
}

function baiduHanyuApiTypeIdiomVer2(
  data: any,
  baiduHanyu: BaiduHanyuObject
): void {
  let definition = data.definitionInfo.definition;
  const dataDetailMeans = data.definitionInfo.detailMeans;
  for (let i = 0; i < dataDetailMeans.length; i++) {
    definition += `\n    ${dataDetailMeans[i].word}: ${dataDetailMeans[i].definition}`;
  }

  const liju = data.liju.map((x: { name: string }) => x.name);

  baiduHanyu.definitionList.push(
    new DefinitionObject(data.pinyin, [definition], [liju])
  );
}
