const GOOGLE_IDENTITY_SCRIPT_ID = "google-identity-services";
const GMAIL_TOKEN_SESSION_KEY = "lbt-gmail-access-token-v1";

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
};

type StoredGmailToken = {
  accessToken: string;
  expiresAt: number;
  scope: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
          }) => GoogleTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | undefined;
let memoryToken: StoredGmailToken | undefined;

export function getGoogleClientId() {
  return (
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GOOGLE_CLIENT_ID ?? ""
  ).trim();
}

function readStoredToken(): StoredGmailToken | undefined {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return undefined;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(GMAIL_TOKEN_SESSION_KEY) ?? "null") as Partial<StoredGmailToken> | null;
    if (!parsed?.accessToken || !parsed.expiresAt || !parsed.scope) return undefined;
    memoryToken = {
      accessToken: parsed.accessToken,
      expiresAt: Number(parsed.expiresAt),
      scope: parsed.scope,
    };
    return memoryToken;
  } catch {
    return undefined;
  }
}

function writeStoredToken(token: StoredGmailToken) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(GMAIL_TOKEN_SESSION_KEY, JSON.stringify(token));
}

export function clearGmailAccessToken() {
  memoryToken = undefined;
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(GMAIL_TOKEN_SESSION_KEY);
}

export function getValidGmailAccessToken() {
  const token = readStoredToken();
  if (!token) return undefined;
  // Treat tokens as expired one minute early so a sync run does not start with
  // credentials that are likely to expire mid-request.
  if (token.expiresAt - 60_000 <= Date.now()) {
    clearGmailAccessToken();
    return undefined;
  }
  return token.accessToken;
}

export function hasValidGmailAccessToken() {
  return Boolean(getValidGmailAccessToken());
}

function loadGoogleIdentityScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Google sign-in is only available in the browser."));
  }

  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Google Identity Services.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Google Identity Services."));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function requestGmailAccessToken({ prompt = "consent" }: { prompt?: "consent" | "" } = {}) {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error("Set VITE_GOOGLE_CLIENT_ID to connect Gmail in this build.");
  }

  await loadGoogleIdentityScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services did not initialize.");

  const response = await new Promise<GoogleTokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_READONLY_SCOPE,
      callback: resolve,
      error_callback: reject,
    });
    client.requestAccessToken({ prompt });
  });

  if (response.error) {
    throw new Error(response.error_description || response.error);
  }
  if (!response.access_token || !response.expires_in) {
    throw new Error("Google did not return a Gmail access token.");
  }

  const token = {
    accessToken: response.access_token,
    expiresAt: Date.now() + response.expires_in * 1000,
    scope: response.scope ?? GMAIL_READONLY_SCOPE,
  };
  writeStoredToken(token);
  return token;
}

export async function revokeGmailAccessToken() {
  const token = readStoredToken();
  clearGmailAccessToken();
  if (!token?.accessToken || typeof window === "undefined") return;
  await loadGoogleIdentityScript().catch(() => undefined);
  await new Promise<void>((resolve) => {
    window.google?.accounts?.oauth2?.revoke(token.accessToken, resolve);
    if (!window.google?.accounts?.oauth2) resolve();
  });
}
