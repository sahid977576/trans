importScripts('../utils/languages.js', '../utils/storage.js', '../utils/cache.js', '../utils/helpers.js', '../providers/freeTranslator.js', '../providers/openaiTranslator.js', '../license/config.js', '../license/license.js');

const CONTENT_SCRIPT_FILES = ['src/utils/languages.js', 'src/content/languageDetector.js', 'src/content/content.js'];
const CONTENT_STYLE = 'src/content/content.css';

function isRestrictedUrl(url = '') {
  return /^(chrome|edge|about|moz-extension|chrome-extension):/i.test(url) || /chrome.google.com\/webstore/i.test(url) || /^https?:\/\/chrome\.google\.com\/webstore/i.test(url);
}

function sendTabMessage(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      const error = chrome.runtime.lastError;
      resolve(error ? { error: error.message } : response);
    });
  });
}

async function probeContentScript(tabId) {
  const response = await sendTabMessage(tabId, { type: 'PING_CONTENT_SCRIPT' });
  return response?.ok === true;
}

async function ensureContentScript(tab) {
  if (!tab?.id) return { error: 'No active tab was found.' };
  if (isRestrictedUrl(tab.url)) return { error: 'Chrome does not allow extensions to modify this page.' };
  if (await probeContentScript(tab.id)) return { ok: true };
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_SCRIPT_FILES });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: [CONTENT_STYLE] });
  } catch (error) {
    return { error: 'This page does not allow the translator to run.' };
  }
  return await probeContentScript(tab.id) ? { ok: true } : { error: 'The translator could not connect to this page.' };
}

async function activeTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0];
  } catch (error) {
    return null;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) return;
    chrome.contextMenus.create({ id: 'translate-selection', title: 'Translate selected text', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'translate-page', title: 'Translate this page', contexts: ['page'] });
  });
});

async function runPageCommand(tab, message) {
  const ready = await ensureContentScript(tab);
  if (ready.error) return ready;
  return await sendTabMessage(tab.id, message);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'translate-page') await runPageCommand(tab, { type: 'TRANSLATE_PAGE' });
  if (info.menuItemId === 'translate-selection' && info.selectionText) await runPageCommand(tab, { type: 'TRANSLATE_SELECTION', text: info.selectionText });
});

chrome.commands.onCommand.addListener(async command => {
  if (command === 'translate-page') await runPageCommand(await activeTab(), { type: 'TRANSLATE_PAGE' });
});

async function translateBatch(texts, target, mode, source, sameLanguage, settings) {
  if (sameLanguage && mode === 'free') throw new Error('Free Mode does not provide meaningful same-language rewriting. Use AI Mode for re-translation.');
  const output = [], missing = [], positions = [];
  for (let index = 0; index < texts.length; index += 1) {
    const key = makeCacheKey(texts[index], source, target, mode, mode === 'ai' ? 'openai:gpt-4o-mini' : 'free:google');
    const cached = await cacheGet(key);
    if (cached) output[index] = cached;
    else { missing.push(texts[index]); positions.push({ index, key }); }
  }
  if (missing.length) {
    const translated = mode === 'ai' ? await translateWithOpenAI(missing, target, settings.openaiKey, settings.timeout, source || 'auto', sameLanguage) : await translateFree(missing, target, source || 'auto', settings.timeout);
    positions.forEach((position, index) => { output[position.index] = translated[index] || missing[index]; cachePut(position.key, output[position.index]); });
  }
  return output;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_LICENSE') {
    getCachedLicense().then(async state => { let current = state; if (state?.cachedAt && Date.now() - state.cachedAt > LICENSE_CONFIG.validationIntervalMs) { try { current = await revalidateCachedLicense(state); } catch { current = state; } } const withinGrace = current?.cachedAt && Date.now() - current.cachedAt <= LICENSE_CONFIG.offlineGraceMs; sendResponse({ configured: Boolean(LICENSE_CONFIG.edgeFunctionUrl && LICENSE_CONFIG.anonKey), enforcementEnabled: LICENSE_CONFIG.enforcementEnabled, state: current, usable: licenseIsUsable(current) || Boolean(withinGrace && current?.valid) }); });
    return true;
  }
  if (message.type === 'ACTIVATE_LICENSE') {
    validateActivationKey(message.activationKey).then(async result => { if (result?.valid) await cacheLicense(result); sendResponse(result); }).catch(() => sendResponse({ valid: false, code: 'service_error', message: 'Activation service is temporarily unavailable.' }));
    return true;
  }
  if (message.type === 'CLEAR_LICENSE') { clearCachedLicense().then(() => sendResponse({ ok: true })); return true; }
  if (message.type === 'PAGE_COMMAND') {
    getCachedLicense().then(state => { if (LICENSE_CONFIG.enforcementEnabled && !licenseIsUsable(state)) return { error: 'Activate Smart Website Translator to continue.' }; return activeTab().then(tab => runPageCommand(tab, message.command)); }).then(sendResponse).catch(() => sendResponse({ error: 'Could not access the current page.' }));
    return true;
  }
  if (message.type === 'TRANSLATE_BATCH') {
    getSettings().then(settings => translateBatch(message.texts, message.target, message.mode, message.source || 'auto', message.sameLanguage === true, settings)).then(sendResponse).catch(error => sendResponse({ error: error.message || 'Translation failed.' }));
    return true;
  }
  if (message.type === 'DETECT_LANGUAGE') {
    getSettings().then(async settings => {
      const detected = message.mode === 'ai' ? await detectWithOpenAI(message.text, settings.openaiKey, settings.timeout) : await detectFreeLanguage(message.text, settings.timeout);
      sendResponse(detected);
    }).catch(() => sendResponse(null));
    return true;
  }
  if (message.type === 'GET_SETTINGS') { getSettings().then(sendResponse).catch(() => sendResponse(null)); return true; }
  if (message.type === 'SAVE_SETTINGS') { saveSettings(message.values).then(sendResponse).catch(() => sendResponse({ error: 'Could not save settings.' })); return true; }
});