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
# If neither Baidu Hanyu nor Moedict returns a definition, set
# OPENROUTER_API_KEY in the local .env to enable the OpenRouter free-model
# router fallback. In Apps Script, OpenRouter reads the existing DEEPL_API_KEY
# script property.

# Files in src folder will push to Google Apps Script.
clasp push

# In the Apps Script editor, create an installable spreadsheet "On edit"
# trigger for the function named on_edit. An installable trigger is required
# because the handler calls UrlFetchApp and other authorized services.
