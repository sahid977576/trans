import { corsHeaders, json, requireAdmin, sha256 } from '../_shared/auth.ts';
const pattern = /^[A-Z]{2}[0-9]{2}-[0-9]{6}-[0-9]{4}-[0-9]{3}[A-Z]{3}$/;
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function randomInt(max: number) { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); return bytes[0] % max; }
function lettersPart(length: number) { return Array.from({ length }, () => letters[randomInt(letters.length)]).join(''); }
function numbersPart(length: number) { return Array.from({ length }, () => randomInt(10)).join(''); }
function generateKey() { return `${lettersPart(2)}${numbersPart(2)}-${numbersPart(6)}-${numbersPart(4)}-${numbersPart(3)}${lettersPart(3)}`; }
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { client, profile } = await requireAdmin(request);
    const input = await request.json();
    const customerName = String(input.customerName || '').trim(); const customerEmail = String(input.customerEmail || '').trim().toLowerCase(); const licenseType = input.licenseType === 'lifetime' ? 'lifetime' : 'time_limited';
    const expiresAt = licenseType === 'lifetime' ? null : new Date(input.expiresAt || '').toISOString();
    if (!customerName || !/^\S+@\S+\.\S+$/.test(customerEmail) || (licenseType === 'time_limited' && (!expiresAt || new Date(expiresAt).getTime() <= Date.now()))) return json({ error: 'Provide valid customer details and a future expiry.' }, 400);
    let activationKey = ''; let keyHash = ''; let unique = false;
    for (let attempt = 0; attempt < 10 && !unique; attempt++) { activationKey = generateKey(); if (!pattern.test(activationKey)) continue; keyHash = await sha256(activationKey); const existing = await client.from('activation_keys').select('id').eq('key_hash', keyHash).maybeSingle(); unique = !existing.data; }
    if (!unique) return json({ error: 'Could not generate a unique Activation Key. Try again.' }, 500);
    const { data, error } = await client.from('activation_keys').insert({ key_hash: keyHash, key_identifier: activationKey.slice(0, 4), customer_name: customerName, customer_email: customerEmail, license_type: licenseType, expires_at: expiresAt, created_by: profile.id, updated_by: profile.id, notes: input.notes || null }).select('id, key_identifier, customer_name, customer_email, license_type, expires_at, status, created_at').single();
    if (error) return json({ error: 'Could not create Activation Key.' }, 400);
    await client.from('audit_logs').insert({ admin_id: profile.id, action: 'activation_key_created', activation_key_id: data.id, metadata: { key_identifier: data.key_identifier, license_type: licenseType } });
    return json({ ...data, activationKey });
  } catch (error) { return json({ error: error.message === 'Forbidden' ? 'Forbidden' : 'Unauthorized' }, 403); }
});