# Gmail Local Setup

LBT's Gmail auto-import is backend-free in this phase. The browser connects to Google directly, receives a short-lived Gmail access token, fetches candidate messages from the Gmail API, and parses them locally.

## Google Cloud Setup

1. Create or open a Google Cloud project.
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen.
   - Use **External** unless testing inside one Google Workspace.
   - Add yourself as a test user while the app is in testing mode.
   - Add the Gmail readonly scope: `https://www.googleapis.com/auth/gmail.readonly`.
4. Create an OAuth client.
   - Application type: **Web application**.
   - Authorized JavaScript origins for local development:
     - `http://localhost:5173`
     - any tunnel origin you use for phone testing, for example `https://your-tunnel.ngrok-free.dev`
5. Copy the client id into a local `.env` file:

```bash
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
```

6. Restart the Vite dev server after changing `.env`.

## Local Testing Notes

- The app stores Gmail import status and imported source ids in local storage.
- The Gmail access token is intentionally not stored in local storage. It is kept in memory/session storage and expires quickly.
- If the token expires or the PWA reloads without a usable token, the trip menu shows **Reconnect Gmail**.
- Disconnecting Gmail revokes the current token when possible and stops foreground checks.
- Vite sets `Cross-Origin-Opener-Policy: same-origin-allow-popups` for local dev/preview so the Google OAuth popup can communicate cleanly. If a tunnel or future host overrides response headers, keep that policy there too.

## Local LLM Extraction Hook

Gmail import is LLM-ready, but the app does not ship a model binary yet. The default extraction mode is `auto`:

- If a local LLM runtime is configured, Gmail import uses it first.
- If no runtime is configured, or the runtime fails, Gmail import falls back to the deterministic extractor.

The current recommended model target is a small Gemma 4 edge model such as E2B, with E4B only if device testing proves it is acceptable. The model runtime is intentionally abstracted because browser/mobile support, download size, memory use, and startup cost still need separate testing.

Two local development hooks exist:

```bash
VITE_IMPORT_EXTRACTOR=auto
VITE_IMPORT_LLM_ENDPOINT=http://localhost:11434/api/generate
VITE_IMPORT_LLM_MODEL=gemma-4-e2b
```

The endpoint must accept `{ model, prompt, schemaVersion }` and return either strict JSON, `{ "response": "..." }`, `{ "text": "..." }`, `{ "content": "..." }`, or an OpenAI-style `{ "choices": [{ "message": { "content": "..." } }] }` shape. It must return a JSON object with a `candidates` array matching the import schema described in the prompt.

For in-browser experiments, a runtime can also be attached manually:

```js
window.__lbtImportLlm = {
  id: "gemma-4-e2b-local",
  async prepare({ model }) {
    await downloadAndCacheModel(model);
  },
  async generateJson(request) {
    return myLocalModel.generate(request.prompt);
  },
};
```

When Gmail is connected, LBT automatically calls `prepare({ model: "gemma-4-e2b" })` if this browser runtime exists. That is the hook where the local runtime should download/cache the model. If an HTTP extraction endpoint is used, `VITE_IMPORT_LLM_PREPARE_ENDPOINT` can be set so the app calls it once on connect with both `{ model, name }` in the request body:

```bash
VITE_IMPORT_LLM_PREPARE_ENDPOINT=http://localhost:11434/api/pull
```

Without one of these runtimes, Gmail import remains connected but uses the deterministic fallback extractor.

This is only a development integration point. Production local-LLM support still needs explicit model runtime selection, model caching, memory testing, fallback UX, and privacy/compliance review.

## PDF Attachment Extraction

Gmail full-message fetches now extract text from small PDF attachments before running the import extractor. This is intended for flight tickets, booking confirmations, and reservation PDFs that contain selectable text.

- PDF extraction runs locally in the browser through PDF.js.
- Attachments are fetched only after an email passes the lightweight metadata scoring step.
- Extraction is limited to the first few small PDFs per message to avoid downloading large files unnecessarily.
- OCR for scanned/image-only PDFs is not implemented yet.

## Production Notes

This local setup does not complete commercial launch requirements. Before launch, revisit OAuth verification, the privacy policy, the Gmail API User Data Policy, quota/cost limits, and whether a backend refresh-token flow is needed for smoother reconnect behavior.
