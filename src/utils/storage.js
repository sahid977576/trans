const DEFAULT_SETTINGS = { defaultLanguage: 'en', defaultMode: 'free', autoTranslate: false, theme: 'system', batchSize: 12, timeout: 15000, dynamicContent: true, openaiKey: '' };
function getSettings() { return new Promise(resolve => chrome.storage.sync.get(DEFAULT_SETTINGS, resolve)); }
function saveSettings(values) { return chrome.storage.sync.set(values); }