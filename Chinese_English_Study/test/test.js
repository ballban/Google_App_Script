"use strict";
// @ts-ignore
require("dotenv/config");
const { execFileSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// Run when executed directly with node
// Directly call baiduHanyu.js methods and print results to console.
// Provide minimal shims for Apps Script globals.

// const testWords = ["挑", "幸灾乐祸", "转运", "崴脚"];
// const testWords = ["挑", "情怀", "淡色", "有心无力", "截留"];
const testWords = ["褶皱", "皱褶", "小心驶得万年船"];

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

// Use curl with argument arrays for synchronous UrlFetchApp.
function fetchWithCurl(url, options) {
  const args = ["-sS", "-L", "-w", "\n%{http_code}"];

  if (options && typeof options === "object") {
    const opts = options;
    if (opts.method === "post" && opts.payload !== undefined) {
      args.push("-X", "POST");
      if (opts.headers && typeof opts.headers === "object") {
        Object.entries(opts.headers).forEach(([key, value]) => {
          args.push("-H", `${key}: ${value}`);
        });
      }
      args.push("--data", String(opts.payload));
    }
  }

  args.push(url);

  try {
    const output = execFileSync("curl", args, { encoding: "utf-8" });
    const statusMatch = output.match(/\r?\n(\d{3})$/);
    const responseCode = statusMatch ? Number(statusMatch[1]) : 0;
    const contentText = statusMatch ? output.slice(0, statusMatch.index) : output;
    return {
      getResponseCode: () => responseCode,
      getContentText: () => contentText,
    };
  } catch (error) {
    console.error(`Fetch failed for ${url}:`, error.message || error);
    return {
      getResponseCode: () => 0,
      getContentText: () => "",
    };
  }
}

let activeProvider = "";

const urlFetchAppShim = {
  fetch: fetchWithCurl,
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
      if (key === "DEEPL_API_KEY" && activeProvider === "openrouter") {
        return process.env.OPENROUTER_API_KEY || null;
      }
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
  loadGasScript("../src/moedict.js");
  loadGasScript("../src/openrouter.js");
  loadGasScript("../src/ai.js");
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
  activeProvider = "openrouter";
  let baiduObj;
  try {
    baiduObj = baiduHanyu(w);
  } finally {
    activeProvider = "";
  }
  if (!baiduObj || baiduObj.pinyinList.length === 0) {
    console.log("  ❌ No baiduHanyu result.");
    return false;
  } else {
    console.log(`  ✓ Type: ${baiduObj.type}`);
    baiduObj.pinyinList.forEach((d, i) => {
      console.log(`  --- ${d.isCommon ? "Common" : "Uncommon"} definition ${i + 1} ---`);
      console.log(`    Pinyin: ${d.pinyin}`);
      console.log(`${d.getFormattedDefinition()}`);
    });
  }
  return true;
}

function testMDBG(w) {
  console.log("\n[2/3] Fetching MDBG...");
  let mdbgResult = { pinyin: "", definition: "" };
  try {
    if (typeof MDBGWeb === "function") {
      mdbgResult = MDBGWeb(w);
      const definition =
        typeof mdbgResult === "string" ? mdbgResult : mdbgResult?.definition || "";
      if (definition !== "") {
        console.log(`  ✓ MDBG pinyin: ${mdbgResult.pinyin || ""}`);
        console.log(`  ✓ MDBG definition: ${definition}`);
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
        return true;
      } else {
        console.log(`  ❌ DeepL failed: ${deeplResult}`);
      }
    } else {
      console.log("  ⚠ deepl function not available");
    }
  } catch (e) {
    console.error(`  ❌ DeepL error:`, e);
  }
  return false;
}

function runTest() {
  const argv = (process === null || process === void 0 ? void 0 : process.argv) || [];
  const args = argv.slice(2);
  const inputs = args.length > 0 ? args : testWords;
  let failures = 0;
  console.log(`Starting comprehensive test for: ${inputs.join(", ")}`);
  for (const w of inputs) {
    console.log(`\n====== ${w} ======`);
    try {
      const baiduOk = testBaiduHanyu(w);
      const mdbgResult = testMDBG(w);
      const mdbgDefinition =
        typeof mdbgResult === "string" ? mdbgResult : mdbgResult?.definition || "";
      const translationOk = mdbgDefinition === "" ? testDeepL(w) : true;

      if (baiduOk && (mdbgDefinition !== "" || translationOk)) {
        console.log("\n✓ Test complete for", w);
      } else {
        failures += 1;
        console.error("\n❌ Test failed for", w);
      }
    } catch (e) {
      failures += 1;
      const error = e;
      console.error(`\n❌ Error processing ${w}:`, error.message || error);
    }
  }
  console.log("\n========== All tests complete ==========");
  if (failures > 0) {
    process.exitCode = 1;
    console.error(`Failed inputs: ${failures}`);
  }
}
runTest();
