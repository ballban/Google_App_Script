class BaiduHanyuObject {
  pinyinList: Array<string>;
  definitionList: Array<string>;
  lijuList: Array<string>;
  constructor(
    pinyin: string | Array<string> = "",
    definition: string | Array<string> = "",
    liju: string | Array<string> = ""
  ) {
    this.pinyinList = pinyin instanceof Array ? pinyin : [pinyin];
    this.definitionList =
      definition instanceof Array ? definition : [definition];
    this.lijuList = liju instanceof Array ? liju : [liju];
  }
}

// function newGetBaiduHanyu(dict: DictObject): void {
//   try {
//     let url = `https://dict.baidu.com/s?wd=${dict.word}&ptype=zici`;

//     let response = UrlFetchApp.fetch(url);
//     if (response.getResponseCode() != 200) return;

//     const pattern = /<div class="tab-content([\s\S]*?)">([\s\S]*?)<\/div>/;
//     const contentText = response.getContentText().match(pattern);
//     if (contentText == null) return;

//     // get definitions
//     // parse to xml and get [dl] element list
//     let definitionList = [];
//     let document = XmlService.parse(contentText[0].replace("&nbsp;", ""));
//     let elements = document.getRootElement().getChildren("dl");

//     // if definition exist
//     if (elements.length > 0) {
//       for (let i = 0; i < elements.length; i++) {
//         let element = elements[i];

//         let definition = "";
//         let definitions = element.getChild("dd").getChildren("p");
//         for (let j = 0; j < definitions.length; j++) {
//           definition += definitions[j].getValue().trim();
//           if (j != definitions.length - 1) {
//             definition += "\n";
//           }
//         }
//         definitionList.push([definition]);
//       }

//       // get pinyin fuck you xmlservice.parse
//       // get div
//       let pinyinList = [];
//       rexExp = /<div([^<>]*?)id="pinyin">([^]*?)<\/div>/;
//       contentText = response.getContentText().match(rexExp)[0];
//       console.log(contentText);

//       // get b
//       rexExp = /t">([^]*?)<\/b>/g;
//       contentText = contentText.match(rexExp);

//       for (let i = 0; i < contentText.length; i++) {
//         let pinyin = contentText[i].substring(3, contentText[i].length - 4);
//         if (pinyin[0] == "[") pinyin = pinyin.substring(2, pinyin.length - 2);
//         pinyinList.push([pinyin]);
//       }

//       return [pinyinList, definitionList];
//     }
//     // get definition from baidu baike
//     else {
//       let element = document.getRootElement().getChild("p");
//       let a = element.getValue();
//       return [[[""]], [[element.getValue().replace("查看百科", "").trim()]]];
//     }
//   } catch (err) {
//     log(err);
//     return null;
//   }
// }

function baiduHanyuApi(word: string): BaiduHanyuObject {
  const url = `https://hanyuapp.baidu.com/dictapp/swan/termdetail?wd=${word}`;
  const res = UrlFetchApp.fetch(url);
  if (res.getResponseCode() != 200) return new BaiduHanyuObject();
  const data = JSON.parse(res.getContentText()).data;

  let pinyinList = data.definition.map((x: { pinyin: string }) => x.pinyin);
  // Logger.log(`pinyinList: ${pinyinList}`);
  // Logger.log(`data.definition: ${data.definition}`);
  let definitionList = data.definition.map((x: { definition: Array<string> }) =>
    x.definition.join("\n")
  );
  // Logger.log(`definitionList: ${definitionList}`);
  // Logger.log(`data.definition: ${data.definition}`);

  // this data structure is so fucked up
  // for(let i = 0; i < data.definition.length; i++){
  //   pinyinList.push(data.definition[i].pinyin);
  //   definitionList.push(data.definition[i].definition);
  // }

  let lijuList = data.zaoJu.map((x: { name: string }) => x.name);
  // data.zaoJu.array.forEach((element: { name: string; }) => {
  //   lijuList.push(element.name);
  // });

  return new BaiduHanyuObject(pinyinList, definitionList, lijuList);
}
