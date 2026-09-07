const $ = selector => document.querySelector(selector);
const status = (text, kind = '') => { $('#status').textContent = text; $('#status').className = `status ${kind}`; };
const activationStatus = (text, kind = '') => { $('#activationStatus').textContent = text; $('#activationStatus').className = `status ${kind}`; };
LANGUAGES.forEach(language => $('#language').add(new Option(language.name, language.code)));
let pageState = null;
let licenseTimer;

function sendRuntime(message) {
	return new Promise(resolve => chrome.runtime.sendMessage(message, response => {
		const error = chrome.runtime.lastError;
		resolve(error ? { error: 'The extension background service is unavailable. Reload the extension.' } : response);
	}));
}

async function refreshLicense() {
	const result = await sendRuntime({ type: 'GET_LICENSE' });
	if (result?.enforcementEnabled === false) return;
	if (result.usable) {
		$('#licensePill').hidden = false;
		$('#activationCard').hidden = true;
		$('#translatorContent').hidden = false;
		showWelcome(result.state);
		startLicenseTimer(result.state);
		$('#translate').disabled = false;
		$('#restore').disabled = false;
		return;
	}
	$('#activationCard').hidden = false;
	$('#translatorContent').hidden = true;
	$('#licensePill').hidden = true;
	$('#translate').disabled = true;
	$('#restore').disabled = true;
	if (!result?.configured) activationStatus('Activation service is not configured. Add the Supabase Edge Function URL and anon key in src/license/config.js.', 'error');
}

function showWelcome(state) {
	if (!state?.customerName && !state?.customerEmail) return;
	$('#welcomeCard').hidden = false;
	$('#welcomeName').textContent = `Welcome, ${state.customerName || 'licensed user'}`;
	$('#welcomeEmail').textContent = state.customerEmail || '';
}

function startLicenseTimer(state) {
	if (licenseTimer) clearInterval(licenseTimer);
	const update = () => {
		if (state?.licenseType === 'lifetime' || !state?.expiresAt) { $('#licensePill').textContent = '✓ Lifetime License · Active'; return; }
		const remaining = new Date(state.expiresAt).getTime() - Date.now();
		if (remaining <= 0) { $('#licensePill').textContent = '⚠ License Expired'; clearInterval(licenseTimer); $('#translatorContent').hidden = true; $('#activationCard').hidden = false; return; }
		const days = Math.floor(remaining / 86400000); const hours = Math.floor((remaining % 86400000) / 3600000); const minutes = Math.floor((remaining % 3600000) / 60000); const seconds = Math.floor((remaining % 60000) / 1000);
		$('#licensePill').textContent = `✓ License Active · ${days}d ${hours}h ${minutes}m ${seconds}s remaining`;
	};
	update();
	licenseTimer = setInterval(update, 1000);
}

async function refreshPageState() {
	if ($('#translatorContent').hidden) return;
	const target = $('#language').value;
	const mode = document.querySelector('input[name="mode"]:checked').value;
	const result = await sendRuntime({ type: 'PAGE_COMMAND', command: { type: 'GET_PAGE_STATE', target, mode } });
	if (result?.error) { pageState = null; $('#translate').textContent = 'Translate Page'; return; }
	pageState = result;
	$('#translate').textContent = result.sameLanguage ? 'Re-translate Page' : 'Translate Page';
	if (result.sameLanguage) status(`Page is already in ${result.languageName}. You can re-translate it.`);
}

chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, settings => {
	if (chrome.runtime.lastError || !settings) return;
	$('#language').value = settings.defaultLanguage;
	document.querySelector(`input[value="${settings.defaultMode}"]`).checked = true;
	document.documentElement.dataset.theme = settings.theme;
	refreshPageState();
});
refreshLicense();

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	if (chrome.runtime.lastError) { status('Could not inspect the current page.', 'error'); return; }
	const tab = tabs[0];
	$('#pageName').textContent = tab?.title || tab?.url || 'Current tab';
	if (/^(chrome|edge|about|chrome-extension):/i.test(tab?.url || '') || /chrome.google.com\/webstore/i.test(tab?.url || '')) status('Chrome does not allow extensions to modify this page.', 'error');
});

$('#language').onchange = refreshPageState;
document.querySelectorAll('input[name="mode"]').forEach(input => { input.onchange = refreshPageState; });

$('#translate').onclick = async () => {
	status('Translating...');
	const result = await sendRuntime({ type: 'PAGE_COMMAND', command: { type: 'TRANSLATE_PAGE', target: $('#language').value, mode: document.querySelector('input[name="mode"]:checked').value, force: true } });
	status(result?.error || (result?.ok ? 'Translation complete.' : 'Could not reach this page.'), result?.error ? 'error' : 'ok');
	if (result?.ok) refreshPageState();
};

$('#restore').onclick = async () => {
	const result = await sendRuntime({ type: 'PAGE_COMMAND', command: { type: 'RESTORE_PAGE' } });
	status(result?.error || 'Original text restored.', result?.error ? 'error' : 'ok');
	if (!result?.error) refreshPageState();
};

$('#settings').onclick = () => chrome.runtime.openOptionsPage();

	if ($('#activationKey')) $('#activationKey').oninput = event => {
	const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
	const parts = [raw.slice(0, 4), raw.slice(4, 10), raw.slice(10, 14), raw.slice(14, 20)];
	event.target.value = parts.filter(Boolean).join('-');
	};
	if ($('#activate')) $('#activate').onclick = async () => {
	activationStatus('Validating Activation Key...');
	$('#activate').disabled = true;
	const result = await sendRuntime({ type: 'ACTIVATE_LICENSE', activationKey: $('#activationKey').value });
	$('#activate').disabled = false;
	if (!result?.valid) { activationStatus(result?.message || 'Invalid Activation Key.', 'error'); return; }
	activationStatus('✓ Activation Successful', 'ok');
	$('#licensePill').hidden = false;
	showWelcome(result);
	$('#translatorContent').hidden = false;
	$('#translate').disabled = false;
	$('#restore').disabled = false;
	startLicenseTimer(result);
	setTimeout(() => { $('#activationCard').hidden = true; refreshPageState(); }, 500);
	};