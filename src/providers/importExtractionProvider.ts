import { deterministicExtractionEngine } from "../domain/imports/extraction";
import { createLlmExtractionEngine, type ImportLlmRuntime } from "../domain/imports/llmExtraction";
import type { ExtractionEngine } from "../domain/imports/types";
import type { WindowImportLlmRuntime } from "./importModelProvider";

function envValue(name: string) {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name]?.trim();
}

function extractionMode() {
  const mode = envValue("VITE_IMPORT_EXTRACTOR")?.toLowerCase();
  return mode === "llm" || mode === "deterministic" || mode === "auto" ? mode : "auto";
}

function windowRuntime(): ImportLlmRuntime | undefined {
  if (typeof window === "undefined" || typeof window.__lbtImportLlm?.generateJson !== "function") return undefined;
  return {
    id: window.__lbtImportLlm.id ?? "window-local",
    generateJson(request) {
      return Promise.resolve(window.__lbtImportLlm?.generateJson?.(request));
    },
  };
}

function extractTextFromCommonLlmResponse(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;
  if (typeof record.text === "string") return record.text;
  if (typeof record.content === "string") return record.content;
  const choices = record.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as { message?: { content?: unknown }; text?: unknown } | undefined;
    return first?.message?.content ?? first?.text ?? value;
  }
  return value;
}

function httpRuntime(): ImportLlmRuntime | undefined {
  const endpoint = envValue("VITE_IMPORT_LLM_ENDPOINT");
  if (!endpoint) return undefined;
  const model = envValue("VITE_IMPORT_LLM_MODEL") ?? "gemma-4-e2b";
  return {
    id: `http:${model}`,
    async generateJson(request) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          schemaVersion: request.schemaVersion,
        }),
      });
      if (!response.ok) throw new Error(`Import LLM request failed (${response.status}).`);
      return extractTextFromCommonLlmResponse(await response.json());
    },
  };
}

export function getImportExtractionEngine(): ExtractionEngine {
  const mode = extractionMode();
  if (mode === "deterministic") return deterministicExtractionEngine;

  const runtime = windowRuntime() ?? httpRuntime();
  if (!runtime) return deterministicExtractionEngine;
  return createLlmExtractionEngine(runtime, deterministicExtractionEngine);
}
