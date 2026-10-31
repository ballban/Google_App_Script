# Copilot instructions

## Scope

This repository contains `Chinese_English_Study`, a Google Sheets/Google Apps Script tool for looking up a Chinese word's Baidu Hanyu definition and pinyin, then supplying an English definition from MDBG or DeepL.

## Commands

Run project commands from `Chinese_English_Study`.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install dependencies | `npm install` | Uses `package-lock.json`. |
| Validate deployable JavaScript | `npm run build` or `npm run check` | Runs `node --check` on each deployable script under `src`; there is no TypeScript build. |
| Run the live lookup harness | `npm test` | Uses the two default Chinese words in the file. It calls the live Baidu, MDBG, and possibly DeepL endpoints. |
| Run one lookup | `node test/test.js <word>` | The harness accepts one or more words as command-line arguments; it is not an isolated/offline unit test. |
| Benchmark AI models | `npm run benchmark:ai`, `node test/ai-benchmark.js nvidia`, or `node test/ai-benchmark.js nvidia=<model-id>` | Sends the deployed AI request to every NVIDIA Build model and free OpenRouter model (or only the given `provider=model` entries), aborts at `AI_TIMEOUT_MS` (5 seconds), fails answers whose pinyin differs from `EXPECTED_PINYIN` or whose definitions, parts of speech, or examples are not Chinese, and writes results with the system prompt hash to the git-ignored `test/ai-benchmark-results`. Uses live provider quotas. |
| Deploy to Apps Script | `clasp push` | Pushes the `src` directory. The ignored local `.clasp.json` must be available for the linked script. |

There is no lint script or lint configuration.

The local harness reads `DEEPL_API_KEY` through `dotenv`/`.env` when the MDBG lookup is empty and shells out to `curl` for HTTP requests. In Apps Script, the deployed code reads the `DEEPL_API_KEY` script property instead.

## Architecture

- `Chinese_English_Study/src` is the Apps Script deployment root. `appsscript.json` selects the V8 runtime and grants external-request and current-spreadsheet access. It registers no Apps Script libraries: every edit trigger loads them, and a library makes each execution slower.
- `src/main.js` is the spreadsheet orchestration layer. `on_edit` accepts non-empty text edits in column A below the header on any sheet except `log`, waits for a script lock (each edit is a separate Apps Script execution, so global variables do not carry state between edits), re-finds inputs that earlier executions shifted down, writes `Loading...` in column C and flushes it so it appears before the lookups, and processes up to `MAX_BATCH_SIZE` (20) candidates at a time in lower-row-first order. Independent Baidu Hanyu and MDBG requests are sent with `UrlFetchApp.fetchAll`; every request in a `fetchAll` batch must set `muteHttpExceptions: true`, because one unmuted HTTP error throws away the whole batch. Single-character misses get a Baidu word lookup before the separate DeepL batch, which is created only for MDBG misses. Each word occupies exactly two rows: the first row contains the word, common Baidu pinyin (or MDBG pinyin if Baidu has none), and Chinese definitions; the second row leaves A/B blank and contains the English definition in C. Idiom input cells are colored red, and processing errors can be recorded on a sheet named `log`.
- `pasteToSheet` owns the two-row output contract. `ensureWritableOutputRows` inserts rows when an existing input would be displaced, and `countStaleOutputRows` finds leftover output in following blank rows so `pasteToSheet` can clear it; it is read before the output is written so the sheet is not flushed between steps. Changes to the output shape must keep these helpers consistent.
- `src/baiduHanyu.js` is the dictionary/domain model layer. Single-character input first uses Baidu's character endpoint; other input uses the term endpoint. The parser handles term, idiom, Baike, and character response shapes and formats `BaiduHanyuObject`, `PinyinObject`, and `Definition` instances for spreadsheet output. If both Baidu paths are empty, it delegates to `src/moedict.js`; `main.js` only writes common pronunciations.
- `src/moedict.js` is the public fallback provider. It queries Moedict's JSON endpoint directly, then uses the public `api.zhconvert.org` API to convert simplified input to Traditional before retrying and to convert returned definitions/examples back to Simplified. Moedict supplies pinyin and Chinese definitions, but does not reliably identify idioms for the existing red-cell convention.
- `src/ai.js` defines the provider-neutral AI request/parse/result interface and picks the provider from the `AI_PROVIDER` script property (`nvidia` or `openrouter`, default `nvidia`) and the model from the optional `AI_MODEL` property (otherwise the provider's `defaultModel`); `main.js` resolves the provider once per batch and passes it to both the request builder and parser. `UrlFetchApp` cannot abort requests, so AI calls longer than `AI_TIMEOUT_MS` (5 seconds) are reported to the `log` sheet, while the local harness and `test/ai-benchmark.js` abort at that limit. `src/nvidia.js` implements the NVIDIA Build provider (OpenAI-compatible `https://integrate.api.nvidia.com/v1/chat/completions`, default model `nvidia/nemotron-3.5-super-vl-120b-a12b` chosen by the benchmark, with `chat_template_kwargs.thinking` disabled) and reads `NVIDIA_BUILD_API_KEY`. `src/openrouter.js` implements the `openrouter/free` provider and reads `OPENROUTER_API_KEY`. Both read Apps Script script properties; the local harness reads `AI_PROVIDER` and the provider keys from `.env` and keeps `DEEPL_API_KEY` for DeepL. AI is attempted only when Baidu and Moedict have no Chinese definition.
- `src/MDBG.js` scrapes the MDBG website with string matching on its `<tr class="row">` result rows and `pinyin`/`defs` divs, without an HTML parser library. The active spreadsheet path uses `buildMDBGRequest` and `parseMDBGResponse`; `MDBGWeb` returns an object with `pinyin` and `definition`, and `main.js` uses the `definition` field to decide whether to fall back to DeepL. `MDBGApi` is a separate helper and is not the batch path used by `main.js`.
- `src/deepL.js` calls the DeepL HTTP API through `UrlFetchApp` and returns an error string when credentials or the request fail.
- `test/test.js` is a Node-based integration harness. It loads the deployable provider scripts into a VM and supplies shims for Apps Script globals such as `Logger`, `UrlFetchApp`, and `PropertiesService`; it does not exercise the spreadsheet orchestration in `main.js`.

## Source and deployment boundaries

Treat the checked-in JavaScript under `Chinese_English_Study/src` as the deployable source of truth. These files are plain Apps Script scripts loaded into a shared global namespace, not Node/CommonJS modules; do not add `require`, `child_process`, `fs`, or other Node-only APIs to them.

The local test harness is separate from deployment and may use Node-only APIs. `clasp push` uploads only `src`.

## Conventions to preserve

- Use Apps Script services (`UrlFetchApp`, `PropertiesService`, `Logger`, and Spreadsheet APIs) in deployed code. The test harness's shims rely on the Apps Script response methods `getResponseCode()` and `getContentText()`.
- Use `UrlFetchApp.fetchAll` for independent provider requests; JavaScript `Promise` wrappers do not make Apps Script `UrlFetchApp.fetch` calls concurrent.
- Preserve the provider fallback contract: empty or verification-blocked Baidu objects fall back to Moedict, an empty MDBG definition triggers DeepL, and provider failures are logged or represented by the existing empty/error return values. Keep the request builders and response parsers compatible with both the single-provider helpers and `main.js`'s `fetchAll` jobs.
- Preserve the spreadsheet output contract: each word occupies two rows in columns A-C; row one contains the input word, combined common pinyin, and Chinese definitions, while row two leaves A/B blank and contains the English definition in C. MDBG and DeepL output is prefixed with `(MDBG)` or `(deepL)`, while Moedict and AI Chinese definitions are prefixed with the source name, such as `(Moedict)`; AI results use the short name of the model that answered (`nvidia/nemotron-3.5-super-vl-120b-a12b` becomes `(nemotron)`), falling back to the provider name `(NVIDIA Build)` or `(OpenRouter)` when only a router ID such as `openrouter/free` is known. `PinyinObject.isCommon`, the formatter methods, row insertion/cleanup helpers, and idiom coloring affect visible output.
- Keep the edit handler as an installable spreadsheet "On edit" trigger named `on_edit`; simple triggers are not sufficient for the authorized external requests.
- Keep API credentials out of source. Local credentials and deployment files such as `.env`, `creds.json`, `.clasprc.json`, and `.clasp.json` are ignored; use `NVIDIA_BUILD_API_KEY` or `OPENROUTER_API_KEY` in the local environment for AI tests, and set the key for the selected `AI_PROVIDER` plus `DEEPL_API_KEY` as Apps Script properties after deployment. DeepL continues to use `DEEPL_API_KEY` in both environments.
- When changing an external response parser, compare it with the checked-in samples under `response_sample` and update the local harness/shims if the runtime contract changes. Moedict and `api.zhconvert.org` do not require project credentials.
