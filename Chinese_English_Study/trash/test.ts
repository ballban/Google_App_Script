// @ts-ignore
import "dotenv/config";
import { execSync } from "child_process";
import { baiduHanyu, BaiduHanyuObject, PinyinObject } from "../src/baiduHanyu";

// Declare process global for Node.js environment
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
};

// Type definitions for shims
interface LoggerShim {
  log: (...args: unknown[]) => void;
}

interface UrlFetchResponse {
  getResponseCode: () => number;
  getContentText: () => string;
}

interface UrlFetchAppShim {
  fetch: (url: string, options?: unknown) => UrlFetchResponse;
}

interface XmlElement {
  getChildren: () => unknown[];
}

interface XmlDocument {
  getRootElement: () => XmlElement;
}

interface XmlServiceShim {
  parse: (xml: string) => XmlDocument;
}

// Run when executed directly with node
// Directly call baiduHanyu.ts methods and print results to console.
// Provide minimal shims for Apps Script globals so it can run under ts-node.

//const testWords = ["挑", "幸灾乐祸", "转运", "崴脚"];
// const testWords = ["挑", "情怀", "淡色", "有心无力", "截留"];
const testWords = ["截留"];

// Shims
const loggerShim: LoggerShim = {
  log: (...args: unknown[]) => console.log("[Logger]", ...args),
};
(globalThis as Record<string, unknown>).Logger = loggerShim;

// Use curl via execSync for synchronous UrlFetchApp
const urlFetchAppShim: UrlFetchAppShim = {
  fetch: (url: string, options?: unknown): UrlFetchResponse => {
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
            const opts = options as Record<string, unknown>;
            if (opts.method === "post" && opts.payload) {
              const headers = opts.headers as
                | Record<string, string>
                | undefined;
              let headerArgs = "";
              if (headers) {
                Object.entries(headers).forEach(([key, value]) => {
                  headerArgs += ` -H "${key}: ${value}"`;
                });
              }
              curlCmd = `curl -sL -X POST${headerArgs} -d '${opts.payload}' "${url}"`;
            }
          }

          return execSync(curlCmd, { encoding: "utf-8" });
        } catch (e) {
          console.error(`Fetch failed for ${url}:`, e);
          return "{}";
        }
      },
    };
  },
};
(globalThis as Record<string, unknown>).UrlFetchApp = urlFetchAppShim;

// XmlService shim for web fallback (not used in this test)
const xmlServiceShim: XmlServiceShim = {
  parse: (_: string): XmlDocument => ({
    getRootElement: (): XmlElement => ({
      getChildren: () => [],
    }),
  }),
};
(globalThis as Record<string, unknown>).XmlService = xmlServiceShim;

// PropertiesService shim for DeepL API key
interface PropertiesShim {
  getProperty: (key: string) => string | null;
}

interface PropertiesServiceShim {
  getScriptProperties: () => PropertiesShim;
}

const propertiesServiceShim: PropertiesServiceShim = {
  getScriptProperties: (): PropertiesShim => ({
    getProperty: (key: string) => {
      // Return mock API key for testing, or read from environment
      if (key === "DEEPL_API_KEY") {
        return process.env.DEEPL_API_KEY || null;
      }
      return null;
    },
  }),
};
(globalThis as Record<string, unknown>).PropertiesService =
  propertiesServiceShim;

// Import MDBG and DeepL functions (need to be loaded in the same context)
// @ts-ignore - These will be available at runtime
declare function MDBGWeb(input: string): string;
// @ts-ignore
declare function deepl(
  text: string,
  sourceLang?: string,
  targetLang?: string,
): string;

// Load the additional modules
try {
  // @ts-ignore
  require("../src/MDBG.ts");
  // @ts-ignore
  require("../src/deepL.ts");
} catch (e) {
  console.log("Note: MDBG and DeepL modules need to be loaded separately");
}

// Synchronous helper using mocked UrlFetchApp to call endpoints
function runTest(): void {
  const argv = process?.argv || [];
  const args = argv.slice(2);
  const inputs = args.length > 0 ? args : testWords;
  console.log(`Starting comprehensive test for: ${inputs.join(", ")}`);

  for (const w of inputs) {
    console.log(`\n====== ${w} ======`);
    try {
      // Fetch baiduHanyu
      console.log("[1/3] Fetching baiduHanyu...");
      const baiduObj: BaiduHanyuObject = baiduHanyu(w);

      if (!baiduObj || baiduObj.pinyinList.length === 0) {
        console.log("  ❌ No baiduHanyu result.");
      } else {
        console.log(`  ✓ Type: ${baiduObj.type}`);
        baiduObj.pinyinList.forEach((d: PinyinObject, i: number) => {
          console.log(
            `  --- ${d.isCommon ? "Common" : "Uncommon"} definition ${i + 1} ---`,
          );
          console.log(`    Pinyin: ${d.pinyin}`);
          console.log(`${d.getFormattedDefinition()}`);
        });
      }

      // Fetch MDBG
      console.log("\n[2/3] Fetching MDBG...");
      let mdbgResult = "";
      try {
        if (typeof MDBGWeb === "function") {
          mdbgResult = MDBGWeb(w);
          if (mdbgResult && mdbgResult !== "") {
            console.log(`  ✓ MDBG: ${mdbgResult}`);
          } else {
            console.log("  ❌ MDBG returned empty");
          }
        } else {
          console.log("  ⚠ MDBGWeb function not available");
        }
      } catch (e) {
        console.error(`  ❌ MDBG error:`, e);
      }

      // Fetch DeepL if MDBG failed
      console.log("\n[3/3] Checking DeepL...");
      if (mdbgResult === "") {
        console.log("  → MDBG empty, trying DeepL...");
        try {
          if (typeof deepl === "function") {
            const deeplResult = deepl(w, "zh", "en");
            if (
              deeplResult &&
              deeplResult !== "" &&
              !deeplResult.startsWith("Error")
            ) {
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
      } else {
        console.log("  ⊘ Skipped (MDBG succeeded)");
      }

      console.log("\n✓ Test complete for", w);
    } catch (e) {
      const error = e as Error;
      console.error(`\n❌ Error processing ${w}:`, error.message || error);
    }
  }

  console.log("\n========== All tests complete ==========");
}

runTest();
