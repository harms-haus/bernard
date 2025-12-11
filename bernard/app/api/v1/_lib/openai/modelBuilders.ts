import { ChatOpenAI } from "@langchain/openai";

import { resolveApiKey, resolveBaseUrl, splitModelAndProvider, type ResolvedModel } from "@/lib/config/models";

export type ResponseTuning = {
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  logit_bias?: Record<string, number>;
  stop?: string[] | undefined;
};

/**
 * Build an intent LLM client using the configured intent model, falling back to the response model for keys.
 */
export function buildIntentLLM(intentModelConfig: ResolvedModel, responseModelConfig: ResolvedModel) {
  const intentModel = splitModelAndProvider(intentModelConfig.id);
  const intentApiKey =
    resolveApiKey(undefined, intentModelConfig.options) ?? resolveApiKey(undefined, responseModelConfig.options);
  const intentBaseURL = resolveBaseUrl(undefined, intentModelConfig.options);
  return new ChatOpenAI({
    model: intentModel.model,
    apiKey: intentApiKey,
    configuration: { baseURL: intentBaseURL },
    temperature: intentModelConfig.options?.temperature ?? 0,
    ...(intentModel.providerOnly ? { modelKwargs: { provider: { only: intentModel.providerOnly } } } : {})
  });
}

/**
 * Build a response LLM client that honors request overrides and configured defaults.
 */
export function buildResponseLLM(responseModelConfig: ResolvedModel, request: ResponseTuning) {
  const responseModel = splitModelAndProvider(responseModelConfig.id);
  const responseApiKey = resolveApiKey(undefined, responseModelConfig.options);
  const responseBaseURL = resolveBaseUrl(undefined, responseModelConfig.options);
  const responseOptions: ConstructorParameters<typeof ChatOpenAI>[0] = {
    model: responseModel.model,
    apiKey: responseApiKey,
    configuration: { baseURL: responseBaseURL }
  };
  const configuredResponseOptions = responseModelConfig.options ?? {};
  if (typeof request.temperature === "number") responseOptions.temperature = request.temperature;
  else if (typeof configuredResponseOptions.temperature === "number")
    responseOptions.temperature = configuredResponseOptions.temperature;
  if (typeof request.top_p === "number") responseOptions.topP = request.top_p;
  else if (typeof configuredResponseOptions.topP === "number") responseOptions.topP = configuredResponseOptions.topP;
  if (typeof request.frequency_penalty === "number") responseOptions.frequencyPenalty = request.frequency_penalty;
  if (typeof request.presence_penalty === "number") responseOptions.presencePenalty = request.presence_penalty;
  if (typeof request.max_tokens === "number") responseOptions.maxTokens = request.max_tokens;
  else if (typeof configuredResponseOptions.maxTokens === "number") responseOptions.maxTokens = configuredResponseOptions.maxTokens;
  if (request.stop?.length) responseOptions.stop = request.stop;
  if (request.logit_bias) responseOptions.logitBias = request.logit_bias;
  if (responseModel.providerOnly) responseOptions.modelKwargs = { provider: { only: responseModel.providerOnly } };
  return new ChatOpenAI(responseOptions);
}


