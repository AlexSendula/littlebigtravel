import type { ImportLlmRequest } from "../domain/imports/llmExtraction";

export type ImportModelStatus = "not-configured" | "preparing" | "ready" | "failed";

export type ImportModelSetupResult = {
  status: ImportModelStatus;
  runtimeId?: string;
  error?: string;
  preparedAt?: string;
};

export type WindowImportLlmRuntime = {
  id?: string;
  prepare?: (options: { model: string }) => Promise<unknown> | unknown;
  generateJson?: (request: ImportLlmRequest) => Promise<unknown> | unknown;
};

const DEFAULT_IMPORT_MODEL = "gemma-4-e2b";
let currentSetup: ImportModelSetupResult = { status: "not-configured" };
let setupPromise: Promise<ImportModelSetupResult> | undefined;

declare global {
  interface Window {
    __lbtImportLlm?: WindowImportLlmRuntime;
  }
}

function envValue(name: string) {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name]?.trim();
}

function importModelId() {
  return envValue("VITE_IMPORT_LLM_MODEL") ?? DEFAULT_IMPORT_MODEL;
}

function windowRuntime() {
  return typeof window !== "undefined" ? window.__lbtImportLlm : undefined;
}

async function prepareWindowRuntime(runtime: WindowImportLlmRuntime) {
  if (typeof runtime.prepare === "function") {
    await runtime.prepare({ model: importModelId() });
  }
  if (typeof runtime.generateJson !== "function") {
    throw new Error("Local import LLM runtime is missing generateJson().");
  }
  return runtime.id ?? "window-local";
}

async function prepareHttpRuntime() {
  const endpoint = envValue("VITE_IMPORT_LLM_PREPARE_ENDPOINT");
  const generationEndpoint = envValue("VITE_IMPORT_LLM_ENDPOINT");
  if (!generationEndpoint) return undefined;
  if (endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: importModelId(), name: importModelId() }),
    });
    if (!response.ok) throw new Error(`Import model setup failed (${response.status}).`);
  }
  return `http:${importModelId()}`;
}

export function getImportModelSetupStatus() {
  return currentSetup;
}

export async function prepareImportModel(): Promise<ImportModelSetupResult> {
  if (setupPromise) return setupPromise;
  const runtime = windowRuntime();
  if (!runtime && !envValue("VITE_IMPORT_LLM_ENDPOINT")) {
    currentSetup = {
      status: "not-configured",
      error: "No local import LLM runtime is configured.",
    };
    return currentSetup;
  }

  currentSetup = { ...currentSetup, status: "preparing", error: undefined };
  setupPromise = (async () => {
    try {
      const runtimeId = runtime ? await prepareWindowRuntime(runtime) : await prepareHttpRuntime();
      currentSetup = {
        status: "ready",
        runtimeId,
        preparedAt: new Date().toISOString(),
      };
      return currentSetup;
    } catch (error) {
      currentSetup = {
        status: "failed",
        runtimeId: runtime?.id,
        error: error instanceof Error ? error.message : "Import model setup failed.",
      };
      return currentSetup;
    } finally {
      setupPromise = undefined;
    }
  })();
  return setupPromise;
}
