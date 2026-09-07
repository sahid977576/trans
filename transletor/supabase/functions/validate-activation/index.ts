import { corsHeaders, json, serviceClient, sha256, signLicenseToken, verifyLicenseToken } from '../_shared/auth.ts';
const pattern = /^[A-Z]{2}[0-9]{2}-[0-9]{6}-[0-9]{4}-[0-9]{3}[A-Z]{3}$/;
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const input = await request.json();
    const client = serviceClient();
    let license: any = null;
    if (input.validationToken) { const claims = await verifyLicenseToken(String(input.validationToken)); if (!claims?.licenseId) return json({ valid: false, code: 'invalid', message: 'Invalid license session.' }, 401); const result = await client.from('activation_keys').select('id, license_type, expires_at, status, activation_count, customer_name, customer_email').eq('id', claims.licenseId).maybeSingle(); license = result.data; }
    else { const activationKey = String(input.activationKey || '').trim().toUpperCase(); if (!pattern.test(activationKey)) return json({ valid: false, code: 'invalid_format', message: 'Invalid Activation Key.' }, 400); const hash = await sha256(activationKey); const result = await client.from('activation_keys').select('id, license_type, expires_at, status, activation_count, customer_name, customer_email').eq('key_hash', hash).maybeSingle(); license = result.data; }
    if (!license) return json({ valid: false, code: 'invalid', message: 'Invalid Activation Key.' }, 401);
    const now = Date.now();
    if (license.status === 'suspended') return json({ valid: false, code: 'suspended', message: 'Activation Temporarily Suspended' }, 403);
    if (license.status === 'revoked') return json({ valid: false, code: 'revoked', message: 'Activation Key Revoked' }, 403);
    if (license.expires_at && new Date(license.expires_at).getTime() <= now) { await client.from('activation_keys').update({ status: 'expired', last_used_at: new Date().toISOString() }).eq('id', license.id); return json({ valid: false, code: 'expired', message: 'Activation Key Expired' }, 403); }
    await client.from('activation_keys').update({ last_activated_at: new Date().toISOString(), last_used_at: new Date().toISOString(), activation_count: (license.activation_count || 0) + 1 }).eq('id', license.id);
    await client.from('audit_logs').insert({ action: 'activation_key_activated', activation_key_id: license.id, metadata: { license_type: license.license_type } });
    return json({ valid: true, status: 'active', licenseType: license.license_type, expiresAt: license.expires_at || null, customerName: license.customer_name, customerEmail: license.customer_email, validationToken: await signLicenseToken(license.id) });
  } catch { return json({ valid: false, code: 'service_error', message: 'Activation service is temporarily unavailable.' }, 500); }
});