"use strict";

/**
 * Returns a definition from Azure OpenAI using the AI prompt template.
 * @param {string} word - The word to be defined.
 * @returns {BaiduHanyuObject} - The parsed BaiduHanyuObject.
 */
async function GetDefinitionFromAI(word) {
  Logger.log("GetDefinitionFromAI start.");
  const aiResultText = await AzureOpenAi(word);
  if (!aiResultText) {
    Logger.log("AzureOpenAi failed to return a valid response.");
    return new BaiduHanyuObject([], WordType.unknown, word);
  }
  
  try {
    const aiData = JSON.parse(aiResultText);
    const baiduHanyuObj = new BaiduHanyuObject();
    baiduHanyuObj.name = aiData.name || word;
    baiduHanyuObj.type = aiData.type || WordType.unknown;
    
    if (aiData.pinyinList && Array.isArray(aiData.pinyinList)) {
      aiData.pinyinList.forEach(pObj => {
        const definitions = [];
        if (pObj.definitionList && Array.isArray(pObj.definitionList)) {
          pObj.definitionList.forEach(dObj => {
            const lijuList = dObj.lijuList || [];
            const cixingList = dObj.cixingList || [];
            definitions.push(new Definition(dObj.definition || "", lijuList, cixingList));
          });
        }
        baiduHanyuObj.pinyinList.push(new PinyinObject(pObj.pinyin || "", definitions, pObj.isCommon !== false));
      });
    }
    return baiduHanyuObj;
  } catch (err) {
    Logger.log(`Failed to parse AI response: ${err}`);
    return new BaiduHanyuObject([], WordType.unknown, word);
  }
}

/**
 * Calls Azure OpenAI to get the definition of a word.
 * @param {string} word - The Chinese word or character.
 * @returns {Promise<string>} - The JSON string representing the definition, or null on error.
 */
function AzureOpenAi(word) {
  Logger.log("AzureOpenAi start.");
  
  const properties = PropertiesService.getScriptProperties();
  const endpoint = properties.getProperty("AZURE_OPENAI_ENDPOINT");
  const apiKey = properties.getProperty("AZURE_OPENAI_API_KEY");
  const deploymentName = properties.getProperty("AZURE_OPENAI_DEPLOYMENT_NAME");
  
  if (!endpoint || !apiKey || !deploymentName) {
    Logger.log("Azure OpenAI configuration missing (need AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT_NAME).");
    return Promise.resolve(null);
  }

  // Uses the format for Azure OpenAI endpoints:
  // https://{endpoint}/openai/deployments/{deploymentName}/chat/completions?api-version=2024-02-15-preview
  const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;
  
  const prompt = `你是一个专业的中文词典助手。用户会给你一个中文字或词，请输出该字或词的详细信息（拼音、词性、意思、例句）。
请必须以严格的JSON格式输出，并符合以下数据结构。如果有多音字或多重拼音，请返回多个 pinyinList 元素。对于例句(lijuList)，请提供1-2个简短的句子即可。如果类型是成语，type 请返回 "idiom"，词汇请返回 "term"，单字返回 "character"。

期望JSON结构示例:
{
  "name": "测试",
  "type": "term",
  "pinyinList": [
    {
      "pinyin": "cè shì",
      "isCommon": true,
      "definitionList": [
        {
          "definition": "考查人的知识、技能或对事物的了解程度",
          "cixingList": ["名词", "动词"],
          "lijuList": ["我们明天有一个小测试。", "这种新材料正在接受测试。"]
        }
      ]
    }
  ]
}

用户输入: ${word}
请只返回上文所述的JSON内容，切忌返回多余的markdown格式或其他说明。`;

  const payload = {
    messages: [
      { role: "system", content: "You are a professional Chinese dictionary assistant. Direct JSON output only." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    response_format: { type: "json_object" }
  };

  const options = {
    method: "post",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log(`Azure OpenAI API Error: HTTP ${responseCode} - ${response.getContentText()}`);
      return Promise.resolve(null);
    }
    const json = JSON.parse(response.getContentText());
    if (json.choices && json.choices.length > 0) {
      Logger.log(`AI Response: ${json.choices[0].message.content}`);
      return Promise.resolve(json.choices[0].message.content);
    }
    return Promise.resolve(null);
  } catch (err) {
    Logger.log(`AzureOpenAi Fetch Error: ${err}`);
    return Promise.resolve(null);
  }
}
