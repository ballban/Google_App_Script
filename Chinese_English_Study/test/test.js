"use strict";
// @ts-ignore
require("dotenv/config");
const child_process = require("child_process");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// Run when executed directly with node
// Directly call baiduHanyu.js methods and print results to console.
// Provide minimal shims for Apps Script globals.

// const testWords = ["挑", "幸灾乐祸", "转运", "崴脚"];
// const testWords = ["挑", "情怀", "淡色", "有心无力", "截留"];
const testWords = ["褶皱", "皱褶"];

// Shims
const loggerShim = {
  log: (...args) => console.log("[Logger]", ...args),
};
globalThis.Logger = loggerShim;

// Try to load Cheerio if available
try {
  const cheerio = require("cheerio");
  globalThis.Cheerio = cheerio;
} catch (e) {
  console.warn("Cheerio not found, MDBGWeb might fail.");
}

// Use curl via execSync for synchronous UrlFetchApp
const urlFetchAppShim = {
  fetch: (url, options) => {
    return {
      getResponseCode: () => 200,
      getContentText: () => {
        try {
          // Use curl for synchronous fetch
          // -s: silent, -L: follow redirects
          // encoding: 'utf-8' returns string instead of Buffer
          let curlCmd = `curl -sL "${url}"`;
          // Handle POST requests with JSON payload
          if (options && typeof options === "object") {
            const opts = options;
            if (opts.method === "post" && opts.payload) {
              const headers = opts.headers;
              let headerArgs = "";
              if (headers) {
                Object.entries(headers).forEach(([key, value]) => {
                  headerArgs += ` -H "${key}: ${value}"`;
                });
              }
              // Escape single quotes for shell
              const payload = opts.payload.replace(/'/g, "'\\''");
              curlCmd = `curl -sL -X POST${headerArgs} -d '${payload}' "${url}"`;
            }
          }
          return child_process.execSync(curlCmd, { encoding: "utf-8" });
        } catch (e) {
          console.error(`Fetch failed for ${url}:`, e);
          return "{}";
        }
      },
    };
  },
};
globalThis.UrlFetchApp = urlFetchAppShim;

// XmlService shim for web fallback (not used in this test)
const xmlServiceShim = {
  parse: (_) => ({
    getRootElement: () => ({
      getChildren: () => [],
    }),
  }),
};
globalThis.XmlService = xmlServiceShim;

const propertiesServiceShim = {
  getScriptProperties: () => ({
    getProperty: (key) => {
      // Return mock API key for testing, or read from environment
      if (key === "DEEPL_API_KEY") {
        return process.env.DEEPL_API_KEY || null;
      }
      return null;
    },
  }),
};
globalThis.PropertiesService = propertiesServiceShim;

// Helper to load GAS scripts into the global context
function loadGasScript(filePath) {
  const fullPath = path.resolve(__dirname, filePath);
  const code = fs.readFileSync(fullPath, "utf8");
  vm.runInThisContext(code, fullPath);
}

// Load the source files
try {
  loadGasScript("../src/baiduHanyu.js");
  loadGasScript("../src/MDBG.js");
  loadGasScript("../src/deepL.js");
} catch (e) {
  console.error("Error loading source files:", e);
  process.exit(1);
}

// Synchronous helper using mocked UrlFetchApp to call endpoints
// Synchronous helper using mocked UrlFetchApp to call endpoints
function testBaiduHanyu(w) {
  console.log("[1/3] Fetching baiduHanyu...");
  const baiduObj = baiduHanyu(w);
  if (!baiduObj || baiduObj.pinyinList.length === 0) {
    console.log("  ❌ No baiduHanyu result.");
  } else {
    console.log(`  ✓ Type: ${baiduObj.type}`);
    baiduObj.pinyinList.forEach((d, i) => {
      console.log(`  --- ${d.isCommon ? "Common" : "Uncommon"} definition ${i + 1} ---`);
      console.log(`    Pinyin: ${d.pinyin}`);
      console.log(`${d.getFormattedDefinition()}`);
    });
  }
}

function testMDBG(w) {
  console.log("\n[2/3] Fetching MDBG...");
  let mdbgResult = { pinyin: "", definition: "" };
  try {
    if (typeof MDBGWeb === "function") {
      mdbgResult = MDBGWeb(w);
      if (mdbgResult && mdbgResult.definition !== "") {
        console.log(`  ✓ MDBG pinyin: ${mdbgResult.pinyin}`);
        console.log(`  ✓ MDBG definition: ${mdbgResult.definition}`);
      } else {
        console.log("  ❌ MDBG returned empty");
      }
    } else {
      console.log("  ⚠ MDBGWeb function not available");
    }
  } catch (e) {
    console.error(`  ❌ MDBG error:`, e);
  }
  return mdbgResult;
}

function testDeepL(w) {
  console.log("\n[3/3] Checking DeepL...");
  try {
    if (typeof deepl === "function") {
      const deeplResult = deepl(w, "zh", "en");
      if (deeplResult && deeplResult !== "" && !deeplResult.startsWith("Error")) {
        console.log(`  ✓ DeepL: ${deeplResult}`);
      } else {
        console.log(`  ❌ DeepL failed: ${deeplResult}`);
      }
    } else {
      console.log("  ⚠ deepl function not available");
    }
  } catch (e) {
    console.error(`  ❌ DeepL error:`, e);
  }
}

function runTest() {
  const argv = (process === null || process === void 0 ? void 0 : process.argv) || [];
  const args = argv.slice(2);
  const inputs = args.length > 0 ? args : testWords;
  console.log(`Starting comprehensive test for: ${inputs.join(", ")}`);
  for (const w of inputs) {
    console.log(`\n====== ${w} ======`);
    try {
      testBaiduHanyu(w);
      testMDBG(w);
      testDeepL(w);
      console.log("\n✓ Test complete for", w);
    } catch (e) {
      const error = e;
      console.error(`\n❌ Error processing ${w}:`, error.message || error);
    }
  }
  console.log("\n========== All tests complete ==========");
}
runTest();
