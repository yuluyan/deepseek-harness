import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEEPSEEK_TOP_UP_URL, DEEPSEEK_VENDOR, deepSeekProvider,
} from '../src/credit/deepseek.ts'
import type { CreditFetchContext } from '../src/credit/provider.ts'

/** Resolve every credential reference to a deterministic value. */
const fetchCtx: CreditFetchContext = {
  resolveCredential: async ref => `key-for-${ref}`,
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('deepSeekProvider', () => {
  it('fetches /user/balance with the resolved key and orders currencies deterministically', async () => {
    const fetch = vi.fn(async () => jsonResponse({
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '88.50', granted_balance: '30', topped_up_balance: '58.50' },
        { currency: 'USD', total_balance: '12.34', granted_balance: '4.20', topped_up_balance: '8.14' },
        { currency: 'ZZZ', total_balance: '1', granted_balance: '0', topped_up_balance: '1' },
        { currency: 'AAA', total_balance: '2', granted_balance: '0', topped_up_balance: '2' },
      ],
    }))
    vi.stubGlobal('fetch', fetch)

    const snapshot = await deepSeekProvider().fetch(fetchCtx, new AbortController().signal)

    expect(fetch).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', expect.objectContaining({
      headers: { Authorization: 'Bearer key-for-DEEPSEEK_API_KEY' },
    }))
    expect(snapshot).toMatchObject({
      vendor: DEEPSEEK_VENDOR,
      label: 'DeepSeek',
      ok: true,
      topUpUrl: DEEPSEEK_TOP_UP_URL,
    })
    // USD leads, then the fixed priority (CNY), then unknown codes sorted alphabetically.
    expect(snapshot.balances.map(balance => balance.currency)).toEqual(['USD', 'CNY', 'AAA', 'ZZZ'])
    expect(snapshot.balances[0]).toEqual({
      currency: 'USD', total: '12.34', granted: '4.20', toppedUp: '8.14',
    })
  })

  it('returns a failed snapshot when no credential resolves, without fetching', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    const snapshot = await deepSeekProvider().fetch(
      { resolveCredential: async () => undefined },
      new AbortController().signal,
    )

    expect(snapshot.ok).toBe(false)
    expect(snapshot.error).toContain('DEEPSEEK_API_KEY')
    expect(snapshot.balances).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('normalizes an HTTP error into a failed snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 401)))

    const snapshot = await deepSeekProvider().fetch(fetchCtx, new AbortController().signal)

    expect(snapshot.ok).toBe(false)
    expect(snapshot.error).toBe('balance request failed: HTTP 401')
  })

  it('normalizes a network throw into a failed snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const snapshot = await deepSeekProvider().fetch(fetchCtx, new AbortController().signal)

    expect(snapshot.ok).toBe(false)
    expect(snapshot.error).toBe('ECONNREFUSED')
  })

  it('normalizes a non-Error network throw into a failed snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'network down' }))

    const snapshot = await deepSeekProvider().fetch(fetchCtx, new AbortController().signal)

    expect(snapshot.ok).toBe(false)
    expect(snapshot.error).toBe('network down')
  })

  it('treats a missing balance_infos as an empty ok snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ is_available: true })))

    const snapshot = await deepSeekProvider().fetch(fetchCtx, new AbortController().signal)

    expect(snapshot.ok).toBe(true)
    expect(snapshot.balances).toEqual([])
  })

  it('honors custom baseURL and apiKeyEnv options', async () => {
    const fetch = vi.fn(async () => jsonResponse({ is_available: true, balance_infos: [] }))
    vi.stubGlobal('fetch', fetch)

    await deepSeekProvider({ baseURL: 'http://127.0.0.1:9', apiKeyEnv: 'MY_KEY' }).fetch(
      { resolveCredential: async () => 'k' },
      new AbortController().signal,
    )

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:9/user/balance', expect.objectContaining({
      headers: { Authorization: 'Bearer k' },
    }))
  })
})
