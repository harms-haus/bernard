import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "vitest";

import { OpenAIEmbeddings } from "@langchain/openai";

import {
  getEmbeddingModel,
  resetEmbeddingVerificationState,
  setEmbeddingsFactory,
  setSettingsFetcher,
  verifyEmbeddingConfig
} from "@/lib/config/embeddings";
import { getSettings } from "@/lib/config/settingsCache";

const TEST_TIMEOUT = 2_000;
const VERIFY_TTL_MS = 5 * 60 * 1000;
const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;
const originalDateNow = Date.now;
const defaultFactory = (options: ConstructorParameters<typeof OpenAIEmbeddings>[0]) =>
  new OpenAIEmbeddings(options);

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

const resetEnv = () => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
};

const recordConsoleInfo = () => {
  const calls: Array<Array<unknown>> = [];
  console.info = (...args: Array<unknown>) => {
    calls.push(args);
  };
  return calls;
};

const mockFetchResponses = (responses: Array<Response | Error>) => {
  const calls: FetchCall[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected fetch call");
    if (next instanceof Error) throw next;
    return next;
  };
  return calls;
};

beforeEach(() => {
  setSettingsFetcher(async () => null as any);
  resetEmbeddingVerificationState();
});

afterEach(() => {
  resetEnv();
  resetEmbeddingVerificationState();
  setSettingsFetcher(getSettings);
  setEmbeddingsFactory(defaultFactory);
  globalThis.fetch = originalFetch;
  console.info = originalConsoleInfo;
  Date.now = originalDateNow;
});

void test(
  "verifyEmbeddingConfig returns failure when api key and base url are missing",
  { timeout: TEST_TIMEOUT },
  async () => {
    globalThis.fetch = (async () => {
      throw new Error("unexpected fetch");
    }) as any;
    const result = await verifyEmbeddingConfig();
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /EMBEDDING_API_KEY or EMBEDDING_BASE_URL/);
  }
);

void test(
  "verifyEmbeddingConfig allows base url without api key",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_BASE_URL"] = "http://localhost:11434/v1";
    process.env["EMBEDDING_MODEL"] = "local-embedder";
    setSettingsFetcher(async () => null as any);

    const calls = mockFetchResponses([new Response("{}", { status: 200 })]);

    const result = await verifyEmbeddingConfig();
    assert.equal(result.ok, true);
    const headers = calls[0]?.init?.headers as Record<string, string> | undefined;
    assert.equal(headers?.Authorization, undefined);
  }
);

void test(
  "verifyEmbeddingConfig uses env config, trims base url, and logs probe",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    process.env["EMBEDDING_BASE_URL"] = "https://api.example.com/v1///";
    process.env["EMBEDDING_MODEL"] = "custom-model";
    setSettingsFetcher(async () => null as any);

    const calls = mockFetchResponses([new Response(JSON.stringify({ ok: true }), { status: 200 })]);
    const infoCalls = recordConsoleInfo();

    const result = await verifyEmbeddingConfig();
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    const calledUrl = String(calls[0]?.input);
    assert.equal(calledUrl, "https://api.example.com/v1/embeddings");
    const body = JSON.parse(String(calls[0]?.init?.body));
    assert.equal(body.model, "custom-model");
    assert.equal(body.input, "ping");

    assert.ok(infoCalls.length >= 1);
    assert.ok(infoCalls[0]?.join(" ").includes("probe"));
  }
);

void test(
  "verifyEmbeddingConfig reports errors from non-ok probe responses",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    setSettingsFetcher(async () => null as any);

    mockFetchResponses([new Response("probe failed", { status: 500, statusText: "fail" })]);

    const result = await verifyEmbeddingConfig();
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /Embedding healthcheck failed/i);
    assert.match(result.reason ?? "", /500/);
    assert.match(result.reason ?? "", /fail/);
    assert.match(result.reason ?? "", /probe failed/);
  }
);

void test(
  "verifyEmbeddingConfig reports fetch rejections",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    setSettingsFetcher(async () => null as any);

    mockFetchResponses([new Error("network down")]);

    const result = await verifyEmbeddingConfig();
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /network down/);
  }
);

void test(
  "verifyEmbeddingConfig shares inflight probe across callers",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    setSettingsFetcher(async () => null as any);

    let resolveFetch: (value: Response) => void = () => {};
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      return await new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    };

    const first = verifyEmbeddingConfig();
    const second = verifyEmbeddingConfig();

    // Wait until fetch has been invoked so resolveFetch is populated.
    let spins = 0;
    while (callCount === 0 && spins < 10) {
      await new Promise((resolve) => setImmediate(resolve));
      spins += 1;
    }
    assert.ok(callCount >= 1, "fetch was not invoked");

    resolveFetch(new Response("{}", { status: 200 }));
    const [r1, r2] = await Promise.all([first, second]);
    assert.equal(callCount, 1);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
  }
);

void test(
  "verifyEmbeddingConfig caches results until TTL expires",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    setSettingsFetcher(async () => null as any);

    let now = 1_000;
    Date.now = () => now;

    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      return new Response("{}", { status: 200 });
    };

    const first = await verifyEmbeddingConfig();
    assert.equal(callCount, 1);
    assert.equal(first.ok, true);

    now += VERIFY_TTL_MS - 1000;
    const second = await verifyEmbeddingConfig();
    assert.equal(callCount, 1);
    assert.strictEqual(second, first);

    now += 2_000;
    const third = await verifyEmbeddingConfig();
    assert.equal(callCount, 2);
    assert.equal(third.ok, true);
  }
);

void test(
  "getEmbeddingModel throws when neither api key nor base url is provided",
  { timeout: TEST_TIMEOUT },
  async () => {
    setSettingsFetcher(async () => null as any);
    await assert.rejects(() => getEmbeddingModel(), /EMBEDDING_API_KEY or EMBEDDING_BASE_URL/);
  }
);

void test(
  "getEmbeddingModel allows missing api key when base url is set",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_BASE_URL"] = "http://localhost:11434/v1";
    process.env["EMBEDDING_MODEL"] = "local-embedder";
    setSettingsFetcher(async () => null as any);

    const factoryCalls: Array<ConstructorParameters<typeof OpenAIEmbeddings>[0]> = [];
    setEmbeddingsFactory((options) => {
      factoryCalls.push(options);
      return { fake: true } as unknown as OpenAIEmbeddings;
    });

    const model = await getEmbeddingModel();
    assert.equal((model as any).fake, true);
    assert.equal(factoryCalls.length, 1);
    assert.equal((factoryCalls[0] as any).apiKey, undefined);
    assert.equal((factoryCalls[0] as any).modelName, "local-embedder");
    assert.equal((factoryCalls[0] as any).configuration?.baseURL, "http://localhost:11434/v1");
  }
);

void test(
  "getEmbeddingModel logs once and passes options to factory",
  { timeout: TEST_TIMEOUT },
  async () => {
    process.env["EMBEDDING_API_KEY"] = "env-key";
    process.env["EMBEDDING_BASE_URL"] = "https://base.example.com/v1//";
    process.env["EMBEDDING_MODEL"] = "chosen-model";
    setSettingsFetcher(async () => null as any);

    const infoCalls = recordConsoleInfo();
    const factoryCalls: Array<ConstructorParameters<typeof OpenAIEmbeddings>[0]> = [];
    setEmbeddingsFactory((options) => {
      factoryCalls.push(options);
      return { fake: true } as unknown as OpenAIEmbeddings;
    });

    const first = await getEmbeddingModel();
    const second = await getEmbeddingModel();

    assert.equal(infoCalls.length, 1);
    assert.equal(factoryCalls.length, 2);
    assert.equal((first as any).fake, true);
    assert.equal((second as any).fake, true);

    const opts = factoryCalls[0]!;
    assert.equal(opts.apiKey, "env-key");
    assert.equal((opts as any).modelName, "chosen-model");
    assert.equal((opts as any).configuration?.baseURL, "https://base.example.com/v1//");
  }
);

