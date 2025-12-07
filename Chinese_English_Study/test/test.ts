// @ts-ignore
import { execSync } from "child_process";
import { baiduHanyu, BaiduHanyuObject, PinyinObject } from "../src/baiduHanyu";

// Run when executed directly with node
// Directly call baiduHanyu.ts methods and print results to console.
// Provide minimal shims for Apps Script globals so it can run under ts-node.

//const testWords = ["挑", "幸灾乐祸", "转运", "崴脚"];
const testWords = ["挑", "情怀"];
// Shims
(globalThis as any).Logger = {
  log: (...args: any[]) => console.log("[Logger]", ...args),
};

// Use curl via execSync for synchronous UrlFetchApp
(globalThis as any).UrlFetchApp = {
  fetch: (url: string) => {
    return {
      getResponseCode: () => 200,
      getContentText: () => {
        try {
          // Use curl for synchronous fetch
          // -s: silent, -L: follow redirects
          // encoding: 'utf-8' returns string instead of Buffer
          return execSync(`curl -sL "${url}"`, { encoding: "utf-8" });
        } catch (e) {
          console.error(`Fetch failed for ${url}:`, e);
          return "{}";
        }
      },
    } as any;
  },
};

// XmlService shim for web fallback (not used in this test)
(globalThis as any).XmlService = {
  parse: (_: string) => ({ getRootElement: () => ({ getChildren: () => [] }) }),
} as any;

// Synchronous helper using mocked UrlFetchApp to call endpoints
function runTest(): void {
  const argv = (globalThis as any).process?.argv || [];
  const args = argv.slice(2);
  const inputs = args.length > 0 ? args : testWords;
  console.log(`Starting baiduHanyu test for: ${inputs.join(", ")}`);
  for (const w of inputs) {
    console.log(`\n====== ${w} ======`);
    try {
      const obj: BaiduHanyuObject = baiduHanyu(w);
      if (!obj || obj.pinyinList.length === 0) {
        console.log("No result.");
        continue;
      }
      console.log(`type: ${obj.type}`);
      obj.pinyinList.forEach((d: PinyinObject, i: number) => {
        console.log(
          `--- ${d.isCommon ? "Common" : "Uncommon"} definition ${i + 1} ---`
        );
        console.log(`  yinpin: ${d.pinyin}`);
        console.log(`${d.getFormattedDefinition()}`);
      });
    } catch (e: any) {
      console.error(e);
    }
  }
}

runTest();
