import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getModelIds,
  clearFreeLlmRouterCacheForTests,
  verifyFreeLlmRouterApiKey,
} from '../src/freeLlmRouter.js';
import { issueFromHttpStatus } from '../src/openrouter.js';

describe('issueFromHttpStatus', () => {
  it('maps status codes for Free LLM Router feedback', () => {
    expect(issueFromHttpStatus(429)).toBe('rate_limited');
    expect(issueFromHttpStatus(503)).toBe('unavailable');
    expect(issueFromHttpStatus(500)).toBe('error');
    expect(issueFromHttpStatus(401)).toBe('error');
  });
});

describe('getModelIds', () => {
  beforeEach(() => {
    clearFreeLlmRouterCacheForTests();
    process.env.FREE_LLM_ROUTER_API_KEY = 'test-router-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ids: ['meta/llama:free', 'other/model:free'], count: 2 }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.FREE_LLM_ROUTER_API_KEY;
  });

  it('throws when FREE_LLM_ROUTER_API_KEY is missing', async () => {
    delete process.env.FREE_LLM_ROUTER_API_KEY;
    await expect(getModelIds(['chat'], 'capable', 5)).rejects.toThrow('FREE_LLM_ROUTER_API_KEY');
  });

  it('throws a clear message on 401 from router API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":"Invalid API key"}',
      })
    );
    await expect(getModelIds(['chat'], 'capable', 5)).rejects.toThrow(
      /freellmrouter\.com\/dashboard\?tab=api[\s\S]*OPEN_ROUTER_API_KEY/
    );
  });

  it('parses ids from API response', async () => {
    const r = await getModelIds(['chat'], 'capable', 5);
    expect(r.ids).toEqual(['meta/llama:free', 'other/model:free']);
  });

  it('caches responses so identical logical params hit fetch once', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await getModelIds(['chat', 'vision'], 'capable', 5);
    await getModelIds(['vision', 'chat'], 'capable', 5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes Authorization and query params in request', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    await getModelIds(['chat'], 'capable', 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://freellmrouter.com/api/v1/models/ids?');
    expect(url).toContain('useCase=chat');
    expect(url).toContain('sort=capable');
    expect(url).toContain('topN=3');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-router-key' });
  });
});

describe('verifyFreeLlmRouterApiKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.FREE_LLM_ROUTER_API_KEY;
  });

  it('returns missing when no apiKey option and env is unset', async () => {
    const r = await verifyFreeLlmRouterApiKey();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('missing');
      expect(r.message).toMatch(/FREE_LLM_ROUTER_API_KEY/);
    }
  });

  it('returns missing when env is only whitespace', async () => {
    process.env.FREE_LLM_ROUTER_API_KEY = '   ';
    const r = await verifyFreeLlmRouterApiKey();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing');
  });

  it('returns unauthorized when API responds 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => '{"error":"Invalid API key"}',
      })
    );
    const r = await verifyFreeLlmRouterApiKey({ apiKey: 'wrong-key' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('unauthorized');
      expect(r.message).toMatch(/401/);
    }
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/models/ids?topN=1'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer wrong-key' },
      })
    );
  });

  it('returns ok when API responds 200 with ids array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ ids: ['x/y:free'], count: 1 }),
      })
    );
    const r = await verifyFreeLlmRouterApiKey({ apiKey: 'good-key' });
    expect(r).toEqual({ ok: true });
  });

  it('returns http_error when API responds non-401 failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'unavailable',
      })
    );
    const r = await verifyFreeLlmRouterApiKey({ apiKey: 'any' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('http_error');
      expect(r.message).toMatch(/503/);
    }
  });

  it('returns bad_response when JSON has no ids array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ count: 0 }),
      })
    );
    const r = await verifyFreeLlmRouterApiKey({ apiKey: 'any' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_response');
  });

  it('uses FREE_LLM_ROUTER_API_KEY from env when apiKey option omitted', async () => {
    process.env.FREE_LLM_ROUTER_API_KEY = 'from-env';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ids: [] }),
      })
    );
    const r = await verifyFreeLlmRouterApiKey();
    expect(r).toEqual({ ok: true });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer from-env' },
    });
  });
});
