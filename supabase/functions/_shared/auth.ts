import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const corsHeaders = { 'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
export function serviceClient() { return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!); }
export async function requireAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Unauthorized');
  const client = serviceClient();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Unauthorized');
  const { data: profile, error: profileError } = await client.from('profiles').select('id, email, role').eq('id', userData.user.id).single();
  if (profileError || profile?.role !== 'admin') throw new Error('Forbidden');
  return { client, user: userData.user, profile };
}
export async function sha256(value: string) { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function base64Url(value: Uint8Array | string) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function signLicenseToken(licenseId: string) { const payload = base64Url(JSON.stringify({ licenseId, issuedAt: Date.now() })); const secret = Deno.env.get('LICENSE_TOKEN_SECRET')!; const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const signature = base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))); return `${payload}.${signature}`; }
export async function verifyLicenseToken(token: string) { try { const [payload, signature] = token.split('.'); if (!payload || !signature) return null; const secret = Deno.env.get('LICENSE_TOKEN_SECRET')!; const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); const normalized = signature.replace(/-/g, '+').replace(/_/g, '/'); const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4); const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(padded), character => character.charCodeAt(0)), new TextEncoder().encode(payload)); if (!valid) return null; return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4))); } catch { return null; } }
export function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }