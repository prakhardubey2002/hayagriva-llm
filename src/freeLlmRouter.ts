/**
 * [Free LLM Router](https://freellmrouter.com/docs): fetch ranked free OpenRouter model IDs.
 * Uses FREE_LLM_ROUTER_API_KEY. Chat calls still go to OpenRouter with OPEN_ROUTER_API_KEY.
 */

const API = 'https://freellmrouter.com/api/v1';

export type FreeRouterUseCase = 'chat' | 'vision' | 'tools' | 'longContext' | 'reasoning';
export type FreeRouterSort = 'contextLength' | 'maxOutput' | 'capable' | 'leastIssues' | 'newest';
export type FreeRouterCacheMode = 'default' | 'no-store';
export type FreeRouterTimeRange = '15m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

const CACHE_TTL_MS = 15 * 60 * 1000;

export interface GetModelIdsResult {
  ids: string[];
  requestId?: string;
  count?: number;
}

/** Result of validating a Free LLM Router API key (does not use the model-ID cache). */
export type FreeLlmRouterKeyVerifyResult =
  | { ok: true }
  | {
    ok: false;
    reason: 'missing' | 'unauthorized' | 'bad_response' | 'http_error';
    message: string;
  };

/**
 * Check whether a Free LLM Router API key is accepted by the service.
 * Uses `GET /models/ids?topN=1` only; does not read or write the in-process model list cache.
 *
 * @param options.apiKey — If omitted, uses `FREE_LLM_ROUTER_API_KEY` from the environment.
 */
export async function verifyFreeLlmRouterApiKey(options?: { apiKey?: string }): Promise<FreeLlmRouterKeyVerifyResult> {
  const key = (options?.apiKey ?? process.env.FREE_LLM_ROUTER_API_KEY)?.trim();
  if (!key) {
    return { ok: false, reason: 'missing', message: 'FREE_LLM_ROUTER_API_KEY is not set' };
  }
  try {
    const res = await fetch(`${API}/models/ids?topN=1`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.status === 401) {
      return {
        ok: false,
        reason: 'unauthorized',
        message:
          'Free LLM Router rejected the key (401). Get a key at https://freellmrouter.com/dashboard?tab=api (docs: https://freellmrouter.com/docs) — it is not OPEN_ROUTER_API_KEY.',
      };
    }
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        reason: 'http_error',
        message: `Free LLM Router API error ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'bad_response', message: 'Free LLM Router returned non-JSON' };
    }
    const ids = body !== null && typeof body === 'object' && 'ids' in body ? (body as { ids: unknown }).ids : undefined;
    if (!Array.isArray(ids)) {
      return { ok: false, reason: 'bad_response', message: 'Free LLM Router response missing ids array' };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'http_error', message: msg };
  }
}

interface CacheEntry {
  data: GetModelIdsResult;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function routerApiKey(): string | undefined {
  return process.env.FREE_LLM_ROUTER_API_KEY?.trim() || undefined;
}

/** Stable cache key regardless of useCase order. */
function cacheKey(
  useCase: FreeRouterUseCase[] | undefined,
  sort: FreeRouterSort | undefined,
  topN: number | undefined,
  maxErrorRate: number | undefined,
  timeRange: FreeRouterTimeRange | undefined,
  myReports: boolean | undefined
): string {
  const normalized = useCase ? [...useCase].sort() : undefined;
  return JSON.stringify({
    useCase: normalized,
    sort,
    topN,
    maxErrorRate,
    timeRange,
    myReports,
  });
}

/**
 * Returns ranked free model IDs for OpenRouter. In-process cache (~15 minutes) matches
 * [Free LLM Router](https://freellmrouter.com/docs) SDK behavior.
 */
export async function getModelIds(
  useCase?: FreeRouterUseCase[],
  sort?: FreeRouterSort,
  topN?: number,
  options?: {
    cache?: FreeRouterCacheMode;
    maxErrorRate?: number;
    timeRange?: FreeRouterTimeRange;
    myReports?: boolean;
  }
): Promise<GetModelIdsResult> {
  const key = routerApiKey();
  if (!key) {
    throw new Error(
      'FREE_LLM_ROUTER_API_KEY is required when using --freellmrouter. Get a key at https://freellmrouter.com/dashboard?tab=api (https://freellmrouter.com/docs)'
    );
  }

  const cacheMode = options?.cache ?? 'default';
  const ck = cacheKey(useCase, sort, topN, options?.maxErrorRate, options?.timeRange, options?.myReports);
  const cached = cache.get(ck);

  if (cacheMode === 'default' && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    const normalizedUseCase = useCase ? [...useCase].sort() : undefined;
    if (normalizedUseCase?.length) params.set('useCase', normalizedUseCase.join(','));
    if (sort) params.set('sort', sort);
    if (topN !== undefined) params.set('topN', String(topN));
    if (options?.maxErrorRate !== undefined) params.set('maxErrorRate', String(options.maxErrorRate));
    if (options?.timeRange) params.set('timeRange', options.timeRange);
    if (options?.myReports) params.set('myReports', 'true');

    const url = `${API}/models/ids?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        throw new Error(
          'Free LLM Router rejected FREE_LLM_ROUTER_API_KEY (401). Get a key at https://freellmrouter.com/dashboard?tab=api — it is not OPEN_ROUTER_API_KEY (OpenRouter). Docs: https://freellmrouter.com/docs'
        );
      }
      throw new Error(`Free LLM Router API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as { ids?: unknown; requestId?: string; count?: number };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : [];
    const result: GetModelIdsResult = {
      ids,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      count: typeof body.count === 'number' ? body.count : ids.length,
    };
    cache.set(ck, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    if (cached) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[hayagriva-llm] Free LLM Router request failed, using stale cached model list', err);
      }
      return cached.data;
    }
    throw err;
  }
}

/** Fire-and-forget feedback (does not count toward router quota per docs). */
export function reportIssue(
  modelId: string,
  issue: 'error' | 'rate_limited' | 'unavailable',
  requestId?: string,
  details?: string
): void {
  const key = routerApiKey();
  if (!key) return;
  fetch(`${API}/models/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modelId, issue, requestId, details }),
  }).catch(() => { });
}

export function reportSuccess(modelId: string, requestId?: string, details?: string): void {
  const key = routerApiKey();
  if (!key) return;
  fetch(`${API}/models/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ modelId, success: true, requestId, details }),
  }).catch(() => { });
}

export function clearFreeLlmRouterCacheForTests(): void {
  cache.clear();
}
