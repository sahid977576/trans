(function () {
  const excluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG']);
  const originals = new WeakMap();
  let translated = false;
  let translating = false;
  let observer;
  let settings = { defaultLanguage: 'en', defaultMode: 'free', dynamicContent: true, batchSize: 12 };
  const debug = (...values) => { if (globalThis.SWT_DEBUG) console.debug('[Smart Website Translator]', ...values); };

  function setupController() {
    let box = document.querySelector('[data-swt-controller]');
    if (box) return box;
    box = document.createElement('aside');
    box.dataset.swtController = 'true';
    box.innerHTML = '<button class="swt-launcher" data-toggle title="Open translator" aria-label="Open translator"><span class="swt-dot"></span></button><div class="swt-panel" hidden><div class="swt-panel-head"><strong>Translate page</strong><button data-close title="Close translator" aria-label="Close translator">×</button></div><label class="swt-field">Language<select data-language></select></label><div class="swt-mode"><label><input type="radio" name="swt-mode" value="free" checked><span>Free</span></label><label><input type="radio" name="swt-mode" value="ai"><span>AI</span></label></div><p class="swt-status" role="status"></p><div class="swt-actions"><button data-translate>Translate</button><button data-restore>Restore</button></div></div>';
    document.documentElement.appendChild(box);
    LANGUAGES.forEach(language => box.querySelector('[data-language]').add(new Option(language.name, language.code)));
    box.querySelector('[data-toggle]').onclick = () => { box.querySelector('.swt-panel').hidden = !box.querySelector('.swt-panel').hidden; };
    box.querySelector('[data-close]').onclick = () => { box.querySelector('.swt-panel').hidden = true; };
    box.querySelector('[data-translate]').onclick = async () => {
      const button = box.querySelector('[data-translate]');
      button.disabled = true;
      const result = await translate(box.querySelector('[data-language]').value, box.querySelector('input[name="swt-mode"]:checked').value, true);
      button.disabled = false;
      if (result?.ok) box.querySelector('.swt-panel').hidden = true;
    };
    box.querySelector('[data-restore]').onclick = restore;
    return box;
  }

  function updateControllerSettings() {
    const box = setupController();
    box.querySelector('[data-language]').value = settings.defaultLanguage;
    box.querySelector(`input[name="swt-mode"][value="${settings.defaultMode}"]`).checked = true;
  }

  const textNodes = () => {
    const nodes = [];
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && !excluded.has(parent.tagName) && !parent.closest('[data-no-translate], [data-swt-controller]') && node.nodeValue.trim() && /\S/.test(node.nodeValue)) nodes.push(node);
    }
    return nodes;
  };

  function send(message) {
    return new Promise(resolve => chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      resolve(error ? { error: 'The extension connection is unavailable.' } : response);
    }));
  }

  function controller(target, status) {
    const box = setupController();
    box.querySelector('.swt-panel').hidden = false;
    box.querySelector('[data-translate]').textContent = target ? `Translate to ${languageName(target)}` : 'Translate';
    box.querySelector('.swt-status').textContent = status || '';
  }

  function getPageState(target = settings.defaultLanguage) {
    const detection = detectPageLanguage();
    const source = normalizeLanguageCode(detection.language);
    const normalizedTarget = normalizeLanguageCode(target);
    return { language: source, confidence: detection.confidence, source: detection.source, sameLanguage: Boolean(source && detection.confidence >= 0.8 && source === normalizedTarget), languageName: languageName(source) };
  }

  async function translate(target = settings.defaultLanguage, mode = settings.defaultMode, force = false) {
    if (translating) return { error: 'Translation is already running.' };
    const detection = detectPageLanguage();
    let source = detection.language || 'auto';
    if (detection.confidence < 0.75 && detection.sample) {
      const providerDetection = await send({ type: 'DETECT_LANGUAGE', text: detection.sample, mode });
      if (providerDetection?.language) { source = providerDetection.language; detection.language = providerDetection.language; detection.confidence = providerDetection.confidence || 0.8; detection.source = providerDetection.source || 'provider'; }
    }
    const normalizedSource = normalizeLanguageCode(source);
    const normalizedTarget = normalizeLanguageCode(target);
    debug(`Detected language: ${languageName(normalizedSource) || 'unknown'}`, `Confidence: ${detection.confidence.toFixed(2)}`, `Detection source: ${detection.source}`, `Target language: ${languageName(normalizedTarget)}`, `Translation required: ${!(detection.confidence >= 0.8 && normalizedSource === normalizedTarget)}`);
    const sameLanguage = detection.confidence >= 0.8 && normalizedSource && normalizedSource === normalizedTarget;
    if (sameLanguage && mode === 'free' && force) return { error: 'Free Mode does not provide meaningful same-language rewriting. Use AI Mode for re-translation.' };
    if (sameLanguage && mode === 'free' && !force) return { error: 'Select AI Mode to re-translate text in the same language.' };
    const nodes = textNodes();
    if (!nodes.length) return { error: 'No translatable text was found on this page.' };
    translating = true;
    controller(target, `0 / ${nodes.length}`);
    const originalValues = new Map(nodes.map(node => [node, originals.get(node) || node.nodeValue]));
    const groups = [...new Set([...originalValues.values()].map(value => value.trim()))];
    const batchSize = Math.max(1, Math.min(50, Number(settings.batchSize) || 12));
    const map = new Map();
    try {
      for (let start = 0; start < groups.length; start += batchSize) {
        const batch = groups.slice(start, start + batchSize);
        const result = await send({ type: 'TRANSLATE_BATCH', texts: batch, target, mode, source: source || 'auto', sameLanguage });
        if (!result || result.error) throw new Error(result?.error || 'Translation provider failed.');
        batch.forEach((value, index) => map.set(value, result[index]));
        controller(target, `${Math.min(start + batch.length, groups.length)} / ${groups.length}`);
        await new Promise(requestAnimationFrame);
      }
      nodes.forEach(node => {
        const value = originalValues.get(node).trim();
        const translation = map.get(value);
        if (translation) {
          originals.set(node, originalValues.get(node));
          node.nodeValue = originalValues.get(node).replace(value, translation);
        }
      });
      translated = true;
      controller(target, 'Ready');
      if (settings.dynamicContent) observe(target, mode);
      return { ok: true };
    } catch (error) {
      controller(target, error.message);
      return { error: error.message };
    } finally {
      translating = false;
    }
  }

  function restore() {
    if (observer) observer.disconnect();
    textNodes().forEach(node => { if (originals.has(node)) node.nodeValue = originals.get(node); });
    const box = setupController();
    box.querySelector('.swt-panel').hidden = true;
    box.querySelector('[data-translate]').textContent = 'Translate';
    box.querySelector('.swt-status').textContent = 'Original text restored.';
    translated = false;
  }

  function observe(target, mode) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(records => {
      if (translating) return;
      const added = records.some(record => [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE));
      if (added) setTimeout(() => { if (translated) { translated = false; translate(target, mode); } }, 300);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function selection(text) {
    const selection = getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : { left: 20, bottom: 20 };
    const dialog = document.createElement('div');
    dialog.dataset.swtSelection = 'true';
    dialog.innerHTML = '<div class="swt-selection-title">Translation</div><p>Translating...</p><button>Copy</button><button aria-label="Close">×</button>';
    document.documentElement.appendChild(dialog);
    dialog.style.left = `${Math.max(8, Math.min(innerWidth - 300, range.left))}px`;
    dialog.style.top = `${Math.min(innerHeight - 130, range.bottom + 8)}px`;
    send({ type: 'TRANSLATE_BATCH', texts: [text], target: settings.defaultLanguage, mode: settings.defaultMode, source: 'auto' }).then(result => {
      dialog.querySelector('p').textContent = result?.[0] || result?.error || 'Unable to translate.';
      dialog.querySelector('button').onclick = () => navigator.clipboard?.writeText(dialog.querySelector('p').textContent);
    });
    dialog.querySelectorAll('button')[1].onclick = () => dialog.remove();
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type === 'PING_CONTENT_SCRIPT') { respond({ ok: true }); return; }
    if (message.type === 'GET_PAGE_STATE') { respond(getPageState(message.target || settings.defaultLanguage)); return; }
    if (message.type === 'TRANSLATE_PAGE') { translate(message.target || settings.defaultLanguage, message.mode || settings.defaultMode, message.force === true).then(respond); return true; }
    if (message.type === 'RESTORE_PAGE') { restore(); respond({ ok: true }); return; }
    if (message.type === 'TRANSLATE_SELECTION' && message.text) { selection(message.text); respond({ ok: true }); return; }
    if (message.type === 'APPLY_SETTINGS') { settings = { ...settings, ...message.settings }; respond({ ok: true }); }
  });

  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, value => {
    if (chrome.runtime.lastError || !value) { setupController(); return; }
    settings = value;
    updateControllerSettings();
    if (settings.autoTranslate) setTimeout(() => translate(), 500);
  });
  setupController();
})();