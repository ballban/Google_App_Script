"use strict";
// Local AI provider benchmark. Sends the deployed AI request to every candidate
// model, aborts at AI_TIMEOUT_MS, and saves the results under
// test/ai-benchmark-results (git-ignored).
//
// Usage: node test/ai-benchmark.js [nvidia] [openrouter]
require("dotenv/config");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WORDS = ["我很无奈", "褶皱", "小心驶得万年船"];
const RESULTS_DIR = path.join(__dirname, "ai-benchmark-results");

globalThis.Logger = { log: () => {} };
globalThis.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => process.env[key] || null,
  }),
};
for (const file of ["baiduHanyu.js", "nvidia.js", "openrouter.js", "ai.js"]) {
  const fullPath = path.resolve(__dirname, "../src", file);
  vm.runInThisContext(fs.readFileSync(fullPath, "utf8"), fullPath);
}
const TIMEOUT_MS = vm.runInThisContext("AI_TIMEOUT_MS");

// Pacing stays under the free-tier rate limits (NVIDIA about 40 requests per
// minute, OpenRouter free models about 20 per minute and 50 per day without
// credits); only models that pass the first word get the remaining words.
const PROVIDERS = {
  nvidia: {
    keyEnv: "NVIDIA_BUILD_API_KEY",
    concurrency: 4,
    minIntervalMs: 1600,
    listModels: async () => {
      const data = await getJson("https://integrate.api.nvidia.com/v1/models");
      return data.data.map((model) => model.id);
    },
  },
  openrouter: {
    keyEnv: "OPENROUTER_API_KEY",
    concurrency: 2,
    minIntervalMs: 3500,
    listModels: async () => {
      const data = await getJson("https://openrouter.ai/api/v1/models");
      const freeTextModels = data.data
        .filter(
          (model) =>
            model.pricing &&
            Number(model.pricing.prompt) === 0 &&
            Number(model.pricing.completion) === 0 &&
            (!model.architecture ||
              !Array.isArray(model.architecture.output_modalities) ||
              model.architecture.output_modalities.includes("text")),
        )
        .map((model) => model.id);
      return Array.from(new Set(["openrouter/free", ...freeTextModels]));
    },
  },
};

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function createPacer(minIntervalMs) {
  let nextStart = 0;
  return async () => {
    const now = Date.now();
    const startAt = Math.max(now, nextStart);
    nextStart = startAt + minIntervalMs;
    if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now));
  };
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function describeHttpError(status, text) {
  let detail = "";
  try {
    const data = JSON.parse(text);
    const error = data.error || data.detail || data.message || data;
    detail = typeof error === "string" ? error : error.message || JSON.stringify(error);
  } catch (err) {
    detail = text;
  }
  return `HTTP ${status}: ${String(detail).replace(/\s+/g, " ").slice(0, 120)}`;
}

async function measure(providerName, model, word) {
  const request = buildAiRequest(word, providerName, model);
  const startedAt = Date.now();
  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text();
    const elapsedMs = Date.now() - startedAt;
    if (response.status !== 200) {
      return { word, elapsedMs, ok: false, reason: describeHttpError(response.status, text) };
    }

    const shim = { getResponseCode: () => response.status, getContentText: () => text };
    const result = createAiHanyuObject(word, parseAiResponse(shim, providerName), providerName);
    const valid = hasChineseDefinition(result);
    return {
      word,
      elapsedMs,
      ok: valid,
      reason: valid ? "" : "invalid dictionary JSON",
      pinyin: valid ? result.pinyinList.map((p) => p.pinyin).join(" / ") : "",
      definition: valid ? result.pinyinList[0].getFormattedDefinition().split("\n")[0] : "",
    };
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const timedOut = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      word,
      elapsedMs,
      ok: false,
      reason: timedOut ? `timeout (> ${TIMEOUT_MS} ms)` : `request failed: ${err.message || err}`,
    };
  }
}

async function benchmarkProvider(providerName) {
  const config = PROVIDERS[providerName];
  if (!process.env[config.keyEnv]) {
    console.log(`[${providerName}] skipped: ${config.keyEnv} is not set.`);
    return [];
  }

  const models = await config.listModels();
  console.log(`[${providerName}] ${models.length} models; screening with "${WORDS[0]}".`);
  const pace = createPacer(config.minIntervalMs);
  const results = models.map((model) => ({ provider: providerName, model, runs: [] }));

  const runWord = (word) => async (entry) => {
    await pace();
    const run = await measure(providerName, entry.model, word);
    entry.runs.push(run);
    const status = run.ok ? `${run.elapsedMs} ms` : run.reason;
    console.log(`[${providerName}] ${entry.model} | ${word} | ${status}`);
  };

  await runPool(results, config.concurrency, runWord(WORDS[0]));
  for (const word of WORDS.slice(1)) {
    const candidates = results.filter((entry) => entry.runs.every((run) => run.ok));
    await runPool(candidates, config.concurrency, runWord(word));
  }
  return results;
}

function summarize(entry) {
  const passed = entry.runs.length === WORDS.length && entry.runs.every((run) => run.ok);
  const times = entry.runs.map((run) => run.elapsedMs).sort((a, b) => a - b);
  const failure = entry.runs.find((run) => !run.ok);
  return {
    ...entry,
    passed,
    medianMs: times.length > 0 ? times[Math.floor(times.length / 2)] : null,
    maxMs: times.length > 0 ? times[times.length - 1] : null,
    reason: failure ? `${failure.word}: ${failure.reason}` : "",
  };
}

async function main() {
  const requested = process.argv.slice(2);
  const providerNames = requested.length > 0 ? requested : Object.keys(PROVIDERS);
  const unknown = providerNames.filter((name) => !PROVIDERS[name]);
  if (unknown.length > 0) {
    console.error(`Unknown provider: ${unknown.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  const providerResults = await Promise.all(providerNames.map(benchmarkProvider));
  const results = providerResults
    .flat()
    .map(summarize)
    .sort(
      (a, b) =>
        Number(b.passed) - Number(a.passed) ||
        (a.passed ? a.medianMs - b.medianMs : a.model.localeCompare(b.model)),
    );
  const passed = results.filter((entry) => entry.passed);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const resultPath = path.join(
    RESULTS_DIR,
    `${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    resultPath,
    `${JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        timeoutMs: TIMEOUT_MS,
        words: WORDS,
        passed: passed.map(({ provider, model, medianMs, maxMs }) => ({
          provider,
          model,
          medianMs,
          maxMs,
        })),
        results,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${passed.length} of ${results.length} models answered every word within ${TIMEOUT_MS} ms.`);
  passed.forEach((entry) => {
    console.log(`  ${entry.provider.padEnd(10)} ${entry.model}  median ${entry.medianMs} ms, max ${entry.maxMs} ms`);
  });
  if (passed.length > 0) {
    console.log(`\nFastest: set AI_PROVIDER=${passed[0].provider} and AI_MODEL=${passed[0].model}`);
  }
  console.log(`Results saved to ${path.relative(process.cwd(), resultPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
