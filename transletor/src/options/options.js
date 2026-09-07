const option = id => document.getElementById(id);
const setStatus = (text, kind = '') => { option('status').textContent = text; option('status').className = `status ${kind}`; };
const sendRuntime = message => new Promise(resolve => chrome.runtime.sendMessage(message, response => {
  const error = chrome.runtime.lastError;
  resolve(error ? { error: 'The extension background service is unavailable. Reload the extension.' } : response);
}));

LANGUAGES.forEach(language => option('defaultLanguage').add(new Option(language.name, language.code)));

sendRuntime({ type: 'GET_SETTINGS' }).then(settings => {
  if (!settings || settings.error) { setStatus(settings?.error || 'Could not load settings.', 'error'); return; }
  option('defaultLanguage').value = settings.defaultLanguage;
  document.querySelector(`input[name="defaultMode"][value="${settings.defaultMode}"]`).checked = true;
  option('autoTranslate').checked = settings.autoTranslate;
  option('dynamicContent').checked = settings.dynamicContent;
  option('openaiKey').value = settings.openaiKey || '';
  option('theme').value = settings.theme;
  option('batchSize').value = settings.batchSize;
  option('timeout').value = settings.timeout;
  document.documentElement.dataset.theme = settings.theme;
});

function values() {
  return {
    defaultLanguage: option('defaultLanguage').value,
    defaultMode: document.querySelector('input[name="defaultMode"]:checked').value,
    autoTranslate: option('autoTranslate').checked,
    dynamicContent: option('dynamicContent').checked,
    openaiKey: option('openaiKey').value.trim(),
    theme: option('theme').value,
    batchSize: Math.max(1, Math.min(50, Number(option('batchSize').value))),
    timeout: Math.max(3000, Math.min(60000, Number(option('timeout').value)))
  };
}

async function save() {
  const result = await sendRuntime({ type: 'SAVE_SETTINGS', values: values() });
  setStatus(result?.error || 'Settings saved.', result?.error ? 'error' : 'ok');
}

option('saveKey').onclick = save;
option('removeKey').onclick = () => { option('openaiKey').value = ''; save(); };
option('showKey').onclick = () => {
  const field = option('openaiKey');
  field.type = field.type === 'password' ? 'text' : 'password';
  option('showKey').textContent = field.type === 'password' ? 'Show' : 'Hide';
};
option('theme').onchange = () => { document.documentElement.dataset.theme = option('theme').value; save(); };
option('testKey').onclick = async () => {
  setStatus('Testing key...');
  const settings = values();
  if (!settings.openaiKey) { setStatus('Add a key first.', 'error'); return; }
  const result = await sendRuntime({ type: 'TRANSLATE_BATCH', texts: ['Hello'], target: 'es', mode: 'ai' });
  setStatus(result?.error || 'OpenAI connection works.', result?.error ? 'error' : 'ok');
};