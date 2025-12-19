import assert from "node:assert/strict";
import { afterAll, afterEach, beforeAll, test } from "vitest";

import type { ModelCategory, ModelCategorySettings } from "../lib/config/models";
import {
  DEFAULT_MODEL_ID,
  getModelList,
  getPrimaryModel,
  listFromSettings,
  normalizeList,
  resetSettingsFetcher,
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  setSettingsFetcher,
  splitModelAndProvider
} from "../lib/config/models";

type ModelsOverride = Partial<Record<ModelCategory, ModelCategorySettings | undefined>>;

const TEST_TIMEOUT = 1_000;
const originalEnv = { ...process.env };
const originalConsole = { ...console };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

const settingsWithModels = (overrides: ModelsOverride = {}) =>
  ({
    models: {
      response: { primary: "response-model", fallbacks: ["response-fb"] },
      router: { primary: "router-model", fallbacks: ["router-fb"] },
      memory: { primary: "memory-model", fallbacks: ["memory-fb"] },
      utility: { primary: "utility-model", fallbacks: ["utility-fb"] },
      aggregation: { primary: "aggregation-model", fallbacks: ["aggregation-fb"] },
      ...overrides
    },
    services: {} as any,
    oauth: {} as any,
    backups: {} as any
  }) as any;

beforeAll(() => {
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
});

afterAll(() => {
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

afterEach(() => {
  resetEnv();
  resetSettingsFetcher();
});

test(
  "normalizeList handles arrays, json strings, commas, and blanks",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.deepEqual(normalizeList([" a ", "b", " "]), ["a", "b"]);
    assert.deepEqual(normalizeList('["x","y"]'), ["x", "y"]);
    assert.deepEqual(normalizeList("alpha, beta , 'gamma'"), ["alpha", "beta", "gamma"]);
    assert.deepEqual(normalizeList("  "), []);
    assert.deepEqual(normalizeList(null), []);
  }
);

test(
  "normalizeList falls back to comma parsing when JSON fails",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.deepEqual(normalizeList("[not json"), ["[not json"]);
  }
);

test(
  "listFromSettings returns settings models when present",
  { timeout: TEST_TIMEOUT },
  () => {
    const models = listFromSettings("response", {
      primary: "primary-model",
      fallbacks: [" fallback-one ", "fallback-two"]
    });
    assert.deepEqual(models, ["primary-model", "fallback-one", "fallback-two"]);
  }
);

test(
  "listFromSettings falls back to env when settings are blank",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["UTILITY_MODELS"] = "util-env-1, util-env-2";
    const models = listFromSettings("utility", { primary: " ", fallbacks: [" "] } as ModelCategorySettings);
    assert.deepEqual(models, ["util-env-1", "util-env-2"]);
  }
);

test(
  "listFromSettings returns empty when no settings provided",
  { timeout: TEST_TIMEOUT },
  () => {
    assert.deepEqual(listFromSettings("memory", undefined), []);
  }
);

test(
  "getModelList prefers override and skips fetcher",
  { timeout: TEST_TIMEOUT },
  async () => {
    let called = false;
    setSettingsFetcher(async () => {
      called = true;
      return settingsWithModels();
    });

    const models = await getModelList("memory", { override: ["override-a", " override-b "] });
    assert.deepEqual(models, ["override-a", "override-b"]);
    assert.equal(called, false);
  }
);

test(
  "getModelList accepts JSON override string",
  { timeout: TEST_TIMEOUT },
  async () => {
    const models = await getModelList("response", { override: '["json-a","json-b"]' });
    assert.deepEqual(models, ["json-a", "json-b"]);
  }
);

test(
  "getModelList uses settings before environment",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["ROUTER_MODELS"] = "env-router";
    setSettingsFetcher(async () =>
      settingsWithModels({
        router: { primary: "router-from-settings", fallbacks: ["router-fb"] }
      })
    );
    const models = await getModelList("router");
    assert.deepEqual(models, ["router-from-settings", "router-fb"]);
  }
);

test(
  "getModelList uses summary fallback for aggregation",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["SUMMARY_MODEL"] = "summary-model";
    setSettingsFetcher(async () =>
      settingsWithModels({
        aggregation: { primary: " ", fallbacks: [] }
      })
    );
    const models = await getModelList("aggregation");
    assert.deepEqual(models, ["summary-model"]);
  }
);

test(
  "getModelList uses legacy OPENROUTER_MODEL when settings missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["OPENROUTER_MODEL"] = "legacy-one,legacy-two";
    setSettingsFetcher(async () =>
      settingsWithModels({
        response: { primary: " ", fallbacks: [] }
      })
    );
    const models = await getModelList("response");
    assert.deepEqual(models, ["legacy-one", "legacy-two"]);
  }
);

test(
  "getModelList falls back to provided fallback list when no sources present",
  { timeout: TEST_TIMEOUT },
  async () => {
    setSettingsFetcher(async () =>
      settingsWithModels({
        utility: { primary: " ", fallbacks: [] }
      })
    );
    const models = await getModelList("utility", { fallback: ["fallback-only"] });
    assert.deepEqual(models, ["fallback-only"]);
  }
);

test(
  "getModelList returns default model when all sources empty",
  { timeout: TEST_TIMEOUT },
  async () => {
    setSettingsFetcher(async () =>
      settingsWithModels({
        memory: { primary: " ", fallbacks: [] }
      })
    );
    const models = await getModelList("memory");
    assert.deepEqual(models, [DEFAULT_MODEL_ID]);
  }
);

test(
  "getPrimaryModel returns first resolved model",
  { timeout: TEST_TIMEOUT },
  async () => {
    const primary = await getPrimaryModel("memory", { override: ["primary", "fallback"] });
    assert.equal(primary, "primary");
  }
);

test(
  "resolveBaseUrl prefers options then explicit then env then default",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["OPENROUTER_BASE_URL"] = "https://env-base";
    assert.equal(resolveBaseUrl("https://explicit", { baseUrl: "https://option" }), "https://option");
    assert.equal(resolveBaseUrl("https://explicit"), "https://explicit");
    delete process.env["OPENROUTER_BASE_URL"];
    process.env["OPENROUTER_BASE_URL"] = "https://env-base";
    assert.equal(resolveBaseUrl(undefined), "https://env-base");
    delete process.env["OPENROUTER_BASE_URL"];
    assert.equal(resolveBaseUrl(undefined), "https://openrouter.ai/api/v1");
  }
);

test(
  "resolveApiKey prefers options then explicit then env",
  { timeout: TEST_TIMEOUT },
  () => {
    process.env["OPENROUTER_API_KEY"] = "env-key";
    assert.equal(resolveApiKey("explicit", { apiKey: "option" }), "option");
    assert.equal(resolveApiKey("explicit"), "explicit");
    assert.equal(resolveApiKey(undefined), "env-key");
    delete process.env["OPENROUTER_API_KEY"];
    assert.equal(resolveApiKey(undefined), undefined);
  }
);

test(
  "splitModelAndProvider returns trimmed parts",
  { timeout: TEST_TIMEOUT },
  () => {
    const parsed = splitModelAndProvider("model-a| provider-1, provider-2 ");
    assert.equal(parsed.model, "model-a");
    assert.deepEqual(parsed.providerOnly, ["provider-1", "provider-2"]);

    const noProvider = splitModelAndProvider("just-model");
    assert.equal(noProvider.model, "just-model");
    assert.equal(noProvider.providerOnly, undefined);
  }
);

test(
  "resolveModel returns id and options from settings",
  { timeout: TEST_TIMEOUT },
  async () => {
    setSettingsFetcher(async () =>
      settingsWithModels({
        memory: { primary: "memory-primary", fallbacks: ["memory-fallback"], options: { apiKey: "secret", maxTokens: 123 } }
      })
    );

    const resolved = await resolveModel("memory");
    assert.equal(resolved.id, "memory-primary");
    assert.equal(resolved.options?.apiKey, "secret");
    assert.equal(resolved.options?.maxTokens, 123);
  }
);

