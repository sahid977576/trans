import { corsHeaders, serviceClient, sha256 } from '../_shared/auth.ts';

declare const Deno: { serve(handler: (request: Request) => Response | Promise<Response>): void };

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const pattern = /^[A-Z]{2}[0-9]{2}-[0-9]{6}-[0-9]{4}-[0-9]{3}[A-Z]{3}$/;
const publicCorsHeaders = { ...corsHeaders, 'Access-Control-Allow-Origin': '*' };

function trialJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...publicCorsHeaders, 'Content-Type': 'application/json' } });
}

function canonicalEmail(value: string) {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return value;
  const normalizedDomain = domain.toLowerCase();
  if (normalizedDomain !== 'gmail.com' && normalizedDomain !== 'googlemail.com') return value;
  return `${localPart.split('+')[0].replace(/\./g, '')}@gmail.com`;
}

function randomInt(max: number) {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % max;
}

function generateKey() {
  const part = (length: number, source: string) => Array.from({ length }, () => source[randomInt(source.length)]).join('');
  return `${part(2, letters)}${part(2, '0123456789')}-${part(6, '0123456789')}-${part(4, '0123456789')}-${part(3, '0123456789')}${part(3, letters)}`;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: publicCorsHeaders });
  if (request.method !== 'POST') return trialJson({ error: 'Method not allowed.' }, 405);

  try {
    const input = await request.json();
    const customerName = String(input.customerName || 'Trial user').trim().slice(0, 160);
    const customerEmail = canonicalEmail(String(input.customerEmail || '').trim().toLowerCase().slice(0, 320));
    if (!/^\S+@\S+\.\S+$/.test(customerEmail)) return trialJson({ error: 'Enter a valid email address.' }, 400);

    const client = serviceClient();
    const existingTrial = await client.from('activation_keys').select('id').eq('customer_email', customerEmail).eq('notes', 'public_trial').limit(1).maybeSingle();
    if (existingTrial.error) return trialJson({ error: 'Trial service is not configured. Apply the public trials database migration.' }, 503);
    if (existingTrial.data) return trialJson({ error: 'A trial key was already issued for this email. One trial is allowed per Gmail address.' }, 409);

    let activationKey = '';
    let keyHash = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      activationKey = generateKey();
      if (!pattern.test(activationKey)) continue;
      keyHash = await sha256(activationKey);
      const existing = await client.from('activation_keys').select('id').eq('key_hash', keyHash).maybeSingle();
      if (!existing.data) break;
      activationKey = '';
    }
    if (!activationKey) return trialJson({ error: 'Could not generate a trial key. Try again.' }, 500);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await client.from('activation_keys').insert({ key_hash: keyHash, key_identifier: activationKey.slice(0, 4), customer_name: customerName || 'Trial user', customer_email: customerEmail, license_type: 'time_limited', expires_at: expiresAt, notes: 'public_trial', created_by: null });
    if (error) {
      if (error.code === '23505') return trialJson({ error: 'A trial key was already issued for this email. One trial is allowed per Gmail address.' }, 409);
      return trialJson({ error: 'Could not create a trial key.' }, 400);
    }
    return trialJson({ activationKey, expiresAt });
  } catch {
    return trialJson({ error: 'Trial service is temporarily unavailable.' }, 500);
  }
});
