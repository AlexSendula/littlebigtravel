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

## Production Notes

This local setup does not complete commercial launch requirements. Before launch, revisit OAuth verification, the privacy policy, the Gmail API User Data Policy, quota/cost limits, and whether a backend refresh-token flow is needed for smoother reconnect behavior.
