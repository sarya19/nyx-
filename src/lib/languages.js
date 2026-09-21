const LANGUAGES = ["javascript", "python", "java"];

function isSupportedLanguage(language) {
  return LANGUAGES.includes(String(language || "").trim());
}

module.exports = { LANGUAGES, isSupportedLanguage };
