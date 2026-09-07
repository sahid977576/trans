# Smart Website Translator

Smart Website Translator is a Manifest V3 Chrome extension that translates visible webpage text in place. It preserves the existing DOM structure, attributes, links, controls, layout, and page behavior. Translation requests are brokered through the service worker, and the content script only changes text nodes.

## Features

- Free mode through the Google Translate public endpoint, with no user key.
- Optional OpenAI mode using the current Chat Completions API and `gpt-4o-mini`.
- 31 target languages, stored as editable language-code data.
- Unique-string batching, storage cache with a 500-entry limit, timeout handling, and progress status.
- Restore Original, dynamic-content observation, same-origin frame-compatible content scripts, and selection translation from the context menu.
- Popup, Options page, dark/light/system themes, configurable batch size and timeout.
- `Ctrl+Shift+T` command and context-menu actions.

## Folder structure

`manifest.json` defines the MV3 entry points. `src/background` owns messaging and provider calls. `src/content` owns DOM scanning and safe page updates. `src/providers` contains replaceable provider implementations. `src/popup` and `src/options` contain the extension UI. `src/utils` contains languages, settings, cache, and URL helpers. `assets` contains the extension icons.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this project folder.
4. Pin the extension if desired, then open a normal HTTP(S) webpage.

The extension requests `<all_urls>` content-script matching and host access because translating an arbitrary current webpage requires access to its DOM. The remote provider hosts are also declared so Free and AI requests work from the extension service worker.

## Use

Open the popup, select a target language and Free or AI mode, then select **Translate Page**. The floating page controller can restore the original text or hide itself. Select text, right-click, and choose **Translate selected text** to translate only that selection. The page context-menu command translates the whole page.

## AI mode and key security

Open Settings, enter an OpenAI API key, save it, and use **Test** before translating. The key is stored with `chrome.storage.sync` for personal/local use and is never logged or included in source code. A client-side extension cannot keep a production secret: users, extensions, and network tooling can inspect it. Do not distribute this build with a real key. For public distribution, put the OpenAI request behind your own authenticated backend and replace `translateWithOpenAI` with a backend request while keeping the content and popup contracts unchanged.

## Replace the free provider

Implement the same `translateFree(texts, target, source, timeout)` contract in `src/providers/freeTranslator.js`, or add another provider and select it in `translateBatch` in the service worker. Keep credentials and network calls in the service worker.

## Add languages

Add `[code, name]` to the array in `src/utils/languages.js`. The popup and options page populate automatically. Confirm that the selected provider accepts the code.

## Debugging

Use the service worker **Inspect views** link on `chrome://extensions` for provider and message errors. Right-click the popup and inspect it for UI errors. Use DevTools on the translated tab for content-script errors. The extension intentionally reports friendly errors instead of logging keys or raw authorization failures.

## Known restrictions

Chrome blocks content scripts on `chrome://`, `edge://`, `about:`, the Chrome Web Store, extension pages, and some PDF/internal viewers. Cross-origin iframe documents cannot be inspected by the parent page; the manifest requests all frames so same-origin frames can be handled independently, subject to Chrome page restrictions. Free provider availability and rate limits are external dependencies.

## Package and publish

Test as an unpacked extension first. To package locally, zip the project contents with `manifest.json` at the archive root. For the Chrome Web Store, create a developer account, upload the ZIP in the Developer Dashboard, complete the privacy practices and store listing, and submit for review. Remove personal API keys and review permissions before uploading.

## Development notes

There is no build step or dependency installation. All scripts use MV3-compatible JavaScript and the extension's strict extension-page CSP. The official Smart Website Translator PNG artwork is stored in `assets/brand`, with optimized mark derivatives used for Chrome icons and compact UI surfaces.

## Supabase licensing setup

The repository includes a real Supabase licensing backend under `supabase/`, plus a static first-party admin console under `admin/`. No service-role key, administrator password, or production credential is committed.

1. Create a Supabase project and copy the project URL and public anon key into a private deployment copy of `admin/config.js`.
2. Run `supabase/migrations/202609060001_license_system.sql` and `supabase/migrations/202609070002_public_trials.sql` in the Supabase SQL editor or with the Supabase CLI.
3. Create the first administrator manually in Supabase Authentication using the dashboard or a server-side administrative setup. Assign that user's profile `role` to `admin` in `public.profiles`. Never put administrator credentials in source code.
4. Deploy `validate-activation`, `create-activation`, `admin-actions`, and the public `create-trial` function with the Supabase CLI. Deploy `create-trial` with JWT verification disabled because it is called by the public landing page: `npx supabase functions deploy create-trial --no-verify-jwt`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LICENSE_TOKEN_SECRET`, and production `ALLOWED_ORIGIN` as Edge Function secrets. The service-role key and token secret are never used by the extension or admin browser code.
5. Set the public Edge Function URL and Supabase anon key in the extension's private deployment copy of `src/license/config.js`, then set `enforcementEnabled` to `true` for a licensing-required production build. Leave it `false` during local development until the backend is configured.
6. Serve `admin/` from an HTTPS host. The admin uses Supabase Auth sessions and server-side role checks; it does not trust a frontend role flag.

The exact Activation Key format is enforced both client-side and server-side:

`^[A-Z]{2}[0-9]{2}-[0-9]{6}-[0-9]{4}-[0-9]{3}[A-Z]{3}$`

Keys are generated with Web Crypto in the Edge Function, checked for uniqueness, SHA-256 hashed before storage, and returned in plaintext only once after creation. The database stores only the hash and safe prefix. Admin lists mask the remaining key. Activation validation returns only license status, type, and expiry.

## Admin console

Open the deployed `admin/index.html` at `/admin/login`. Available views are Dashboard, Activation Keys, Customers, Activity Logs, and Settings. Create, suspend, activate, revoke, search/list, and audit operations are server-authorized. Destructive lifecycle actions require confirmation in the console.

## Security notes

`supabase/functions/_shared/auth.ts` verifies the Supabase Auth bearer token and checks `profiles.role = 'admin'` before privileged operations. PostgreSQL RLS prevents non-admin users from reading or modifying activation keys and audit logs. The extension stores only cached license state locally; when enforcement is enabled, the backend remains authoritative at activation time. Configure an appropriate periodic revalidation/token strategy before shipping a production build that must revoke licenses immediately while offline.

The initial administrator password supplied during private setup must be entered only into Supabase Auth or a secure server-side bootstrap process. It is intentionally absent from this repository.