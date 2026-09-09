import type {
  AIProvider,
  AIProviderRequest,
  AIProviderResult,
} from "./aiProvider.js";

/**
 * The risk-linter dependency-guard handshake (B12, risk-linter
 * docs/dependency-budget-contract.md). The admitting side (Python) reserves ONE model
 * request under a request id and spawns this runner; this wrapper makes the child honour
 * that admission: it counts model requests, refuses the (cap+1)th BEFORE any HTTP request
 * is made, and records the provider error's status/code so the admitting side can
 * classify the attempt (429 rate limit vs insufficient_quota, 401, 5xx, transport). The
 * state is echoed verbatim in the runner's printed envelope.
 */
export interface HandshakeProviderError {
  name: string;
  status: number | null;
  code: string | null;
  type: string | null;
  message: string;
}

export interface HandshakeState {
  requestId: string | null;
  modelRequests: number;
  /** null = no handshake in force (uncapped, e.g. a manual smoke run). */
  maxModelRequests: number | null;
  maxRetries: number;
  providerError: HandshakeProviderError | null;
}

export interface HandshakeProviderOptions {
  requestId: string | null;
  maxModelRequests: number | null;
  maxRetries: number;
}

export function createHandshakeProvider(
  inner: AIProvider,
  options: HandshakeProviderOptions,
): { provider: AIProvider; state: HandshakeState } {
  const state: HandshakeState = {
    requestId: options.requestId,
    modelRequests: 0,
    maxModelRequests: options.maxModelRequests,
    maxRetries: options.maxRetries,
    providerError: null,
  };

  return {
    state,
    provider: {
      async generate<TOutput = unknown>(
        request: AIProviderRequest<TOutput>,
      ): Promise<AIProviderResult<TOutput>> {
        if (
          state.maxModelRequests !== null &&
          state.modelRequests >= state.maxModelRequests
        ) {
          throw new Error(
            `risk-linter handshake: model request cap ${state.maxModelRequests} reached ` +
              `for admitted request ${state.requestId ?? "?"}; a further request needs its own admission`,
          );
        }
        state.modelRequests += 1;
        try {
          return await inner.generate(request);
        } catch (error: unknown) {
          const e = error as {
            name?: string;
            status?: unknown;
            code?: unknown;
            type?: unknown;
            category?: unknown;
            message?: string;
          };
          state.providerError = {
            name: typeof e?.name === "string" ? e.name : "Error",
            status: typeof e?.status === "number" ? e.status : null,
            code: typeof e?.code === "string" ? e.code : null,
            type:
              typeof e?.type === "string"
                ? e.type
                : typeof e?.category === "string"
                  ? e.category
                  : null,
            message: typeof e?.message === "string" ? e.message : String(error),
          };
          throw error;
        }
      },
    },
  };
}
