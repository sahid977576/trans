const ACTIVATION_KEY_PATTERN = /^[A-Z]{2}[0-9]{2}-[0-9]{6}-[0-9]{4}-[0-9]{3}[A-Z]{3}$/;
const LICENSE_STORAGE_KEY = 'licenseState';

function normalizeActivationKey(value) { return String(value || '').trim().toUpperCase(); }
function isActivationKeyFormatValid(value) { return ACTIVATION_KEY_PATTERN.test(normalizeActivationKey(value)); }
function getCachedLicense() { return new Promise(resolve => chrome.storage.local.get(LICENSE_STORAGE_KEY, data => resolve(data[LICENSE_STORAGE_KEY] || null))); }
function cacheLicense(state) { return chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: { ...state, cachedAt: Date.now() } }); }
function clearCachedLicense() { return chrome.storage.local.remove(LICENSE_STORAGE_KEY); }
async function revalidateCachedLicense(state) {
  if (!state?.validationToken || !LICENSE_CONFIG.edgeFunctionUrl || !LICENSE_CONFIG.anonKey) return state;
  const response = await fetch(`${LICENSE_CONFIG.edgeFunctionUrl.replace(/\/$/, '')}/validate-activation`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LICENSE_CONFIG.anonKey, Authorization: `Bearer ${LICENSE_CONFIG.anonKey}` }, body: JSON.stringify({ validationToken: state.validationToken }) });
  const result = await response.json().catch(() => null);
  if (response.ok && result?.valid) { await cacheLicense(result); return result; }
  if (result && result.valid === false) { await cacheLicense(result); return result; }
  return state;
}
function licenseIsUsable(state) {
  if (!state || !state.valid || !['active'].includes(state.status)) return false;
  if (state.expiresAt && new Date(state.expiresAt).getTime() <= Date.now()) return false;
  return true;
}
async function validateActivationKey(key) {
  const normalizedKey = normalizeActivationKey(key);
  if (!isActivationKeyFormatValid(normalizedKey)) return { valid: false, code: 'invalid_format', message: 'Enter a valid Activation Key.' };
  if (!LICENSE_CONFIG.edgeFunctionUrl || !LICENSE_CONFIG.anonKey) return { valid: false, code: 'not_configured', message: 'License service is not configured yet.' };
  const response = await fetch(`${LICENSE_CONFIG.edgeFunctionUrl.replace(/\/$/, '')}/validate-activation`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: LICENSE_CONFIG.anonKey, Authorization: `Bearer ${LICENSE_CONFIG.anonKey}` }, body: JSON.stringify({ activationKey: normalizedKey }) });
  const result = await response.json().catch(() => null);
  if (!response.ok) return result || { valid: false, code: 'service_error', message: 'Activation service is temporarily unavailable.' };
  return result;
}