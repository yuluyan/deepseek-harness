import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CreditController } from '../src/credit/controller.ts'
import type { CreditSnapshot } from '../src/credit/types.ts'

function balanceResponse(
  currency = 'USD',
  total = '12.34',
  granted = '4.20',
  toppedUp = '8.14',
): { is_available: boolean; balance_infos: unknown[] } {
  return {
    is_available: true,
    balance_infos: [{ currency, total_balance: total, granted_balance: granted, topped_up_balance: toppedUp }],
  }
}

function okFetch(body: unknown = balanceResponse()): ReturnType<typeof vi.fn> {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
}

function makeController(): { ctx: Context; controller: CreditController } {
  const ctx = new Context()
  ctx.provide('credentials', { resolve: async () => ({ value: 'from-credentials', source: 'memory' }) })
  return { ctx, controller: new CreditController(ctx, { refreshIntervalMs: 15_000 }) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreditController', () => {
  it('populates the cache via the initial poll and lists snapshots', async () => {
    vi.stubGlobal('fetch', okFetch())
    const { ctx, controller } = makeController()
    await vi.waitFor(() => { expect(controller.list()).toHaveLength(1) })
    const snapshot = controller.list()[0]!
    expect(snapshot.ok).toBe(true)
    expect(snapshot.balances[0]?.currency).toBe('USD')
    await ctx.fiber.dispose()
  })

  it('keeps the last good snapshot when a re-fetch fails', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(balanceResponse()), { status: 200 }))
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const { ctx, controller } = makeController()
    await vi.waitFor(() => { expect(controller.list()).toHaveLength(1) })

    const results = await controller.refresh()
    expect(results[0]!.ok).toBe(false)
    expect(controller.list()[0]!.ok).toBe(true)

    await ctx.fiber.dispose()
  })

  it('watch yields the current list and pushes again after a refresh', async () => {
    vi.stubGlobal('fetch', okFetch())
    const { ctx, controller } = makeController()
    await vi.waitFor(() => { expect(controller.list()).toHaveLength(1) })

    const abort = new AbortController()
    const seen: CreditSnapshot[][] = []
    const consume = (async () => {
      for await (const next of controller.watch(abort.signal)) seen.push(next)
    })()
    await vi.waitFor(() => { expect(seen.length).toBeGreaterThanOrEqual(1) })

    await controller.refresh()
    await vi.waitFor(() => { expect(seen.length).toBe(2) })
    abort.abort()
    await consume

    expect(seen[0]).toHaveLength(1)
    expect(seen[1]).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('resolves the credential from the credentials service', async () => {
    const fetch = okFetch()
    vi.stubGlobal('fetch', fetch)
    const { ctx, controller } = makeController()
    await controller.refresh()

    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      headers: { Authorization: 'Bearer from-credentials' },
    }))
    await ctx.fiber.dispose()
  })

  it('falls back to the launch environment when no credentials service exists', async () => {
    const previous = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'from-env'
    try {
      const fetch = okFetch()
      vi.stubGlobal('fetch', fetch)
      const ctx = new Context()
      const controller = new CreditController(ctx, { refreshIntervalMs: 15_000 })
      await controller.refresh()

      expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: { Authorization: 'Bearer from-env' },
      }))
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previous
    }
  })

  it('retries the initial poll until a provider succeeds', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(balanceResponse()), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const { ctx, controller } = makeController()

    await vi.waitFor(() => { expect(controller.list()[0]?.ok).toBe(true) }, { timeout: 5_000 })
    expect(fetch).toHaveBeenCalledTimes(2)
    await ctx.fiber.dispose()
  })

  it('passes a custom apiKeyEnv through to the provider', async () => {
    const resolved: string[] = []
    vi.stubGlobal('fetch', okFetch())
    const ctx = new Context()
    ctx.provide('credentials', {
      resolve: async (ref: string) => {
        resolved.push(String(ref))
        return { value: 'k', source: 'memory' }
      },
    })
    const controller = new CreditController(ctx, { refreshIntervalMs: 15_000, apiKeyEnv: 'MY_KEY' })
    await controller.refresh()
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.every(ref => ref === 'MY_KEY')).toBe(true)
    await ctx.fiber.dispose()
  })

  it('falls back to the default poll interval when none is configured', async () => {
    vi.stubGlobal('fetch', okFetch())
    const ctx = new Context()
    ctx.provide('credentials', { resolve: async () => ({ value: 'k', source: 'memory' }) })
    const controller = new CreditController(ctx)
    await controller.refresh()
    expect(controller.list()[0]?.ok).toBe(true)
    await ctx.fiber.dispose()
  })

  it('refreshes again when the poll interval fires', async () => {
    vi.useFakeTimers()
    try {
      const fetch = okFetch()
      vi.stubGlobal('fetch', fetch)
      const ctx = new Context()
      ctx.provide('credentials', { resolve: async () => ({ value: 'k', source: 'memory' }) })
      new CreditController(ctx, { refreshIntervalMs: 15_000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(fetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(fetch).toHaveBeenCalledTimes(2)
      await ctx.fiber.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the initial poll after exhausting its attempts', async () => {
    vi.useFakeTimers()
    try {
      const fetch = vi.fn(async () => new Response('nope', { status: 503 }))
      vi.stubGlobal('fetch', fetch)
      const ctx = new Context()
      ctx.provide('credentials', { resolve: async () => ({ value: 'k', source: 'memory' }) })
      new CreditController(ctx, { refreshIntervalMs: 15_000 })
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1500)
      await vi.advanceTimersByTimeAsync(3000)
      await vi.advanceTimersByTimeAsync(4500)
      expect(fetch).toHaveBeenCalledTimes(4)
      await ctx.fiber.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to the launch environment when the credentials service resolves nothing', async () => {
    const previous = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'from-env'
    try {
      const fetch = okFetch()
      vi.stubGlobal('fetch', fetch)
      const ctx = new Context()
      ctx.provide('credentials', { resolve: async () => undefined })
      const controller = new CreditController(ctx, { refreshIntervalMs: 15_000 })
      await controller.refresh()
      expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        headers: { Authorization: 'Bearer from-env' },
      }))
      await ctx.fiber.dispose()
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previous
    }
  })

  it('normalizes a provider fetch throw into an error snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new Error('bad json') },
    })))
    const { ctx, controller } = makeController()
    const results = await controller.refresh()
    expect(results[0]!.ok).toBe(false)
    expect(results[0]!.error).toBe('bad json')
    await ctx.fiber.dispose()
  })

  it('normalizes a non-Error provider fetch throw into an error snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw 'bad json' },
    })))
    const { ctx, controller } = makeController()
    const results = await controller.refresh()
    expect(results[0]!.ok).toBe(false)
    expect(results[0]!.error).toBe('bad json')
    await ctx.fiber.dispose()
  })
})
