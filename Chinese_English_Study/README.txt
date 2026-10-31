# Deploy the JavaScript files under src with clasp.

# Install the local test dependencies and validate the deployable scripts.
npm install
npm run build

# Run the live provider checks; pass a word directly to test one input.
npm test
node test/test.js <word>

# Each word uses two output rows: Chinese information on the first row and
# the English definition in column C on the second row.
#
# Baidu Hanyu is attempted first. If its endpoint returns no usable result,
# Moedict is queried through its public JSON endpoint; simplified input is
# converted to Traditional before the fallback lookup, and returned
# definitions/examples are converted back to Simplified. Moedict definitions
# are marked with "(Moedict)" in the Chinese definition cell.
#
# If neither Baidu Hanyu nor Moedict returns a definition, an AI provider
# fills in the Chinese definition. Choose it with the AI_PROVIDER script
# property ("nvidia" or "openrouter"; default "nvidia"). Locally, AI_PROVIDER
# can be set in .env.
#   nvidia:     NVIDIA Build (default nvidia/nemotron-3.5-super-vl-120b-a12b); set
#               NVIDIA_BUILD_API_KEY in .env and as a script property.
#   openrouter: OpenRouter free-model router; set OPENROUTER_API_KEY in .env
#               and as a script property.
# Set the optional AI_MODEL script property (or .env value) to override the
# selected provider's default model; it must be a model ID of AI_PROVIDER.
#
# AI requests should finish within 5 seconds. The local harness aborts AI
# requests at that limit; Apps Script cannot abort a request, so slower calls
# are recorded on the "log" sheet instead. To choose a fast model, run:
npm run benchmark:ai
node test/ai-benchmark.js nvidia
node test/ai-benchmark.js nvidia=nvidia/nemotron-3.5-super-vl-120b-a12b
# It tries every NVIDIA Build model and every free OpenRouter model (or only the
# provider=model entries given), keeps only models that answer every test word
# within 5 seconds with the expected pinyin and Chinese parts of speech, and
# saves the results under test/ai-benchmark-results (not committed).

# Files in src folder will push to Google Apps Script.
clasp push

# In the Apps Script editor, create an installable spreadsheet "On edit"
# trigger for the function named on_edit. An installable trigger is required
# because the handler calls UrlFetchApp and other authorized services.
