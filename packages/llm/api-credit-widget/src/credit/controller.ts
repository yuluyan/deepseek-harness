/**
 * Host Remote owner for the `credit` namespace: polls enabled providers, caches
 * the latest snapshot per vendor, and exposes unary `list`/`refresh` methods to
 * the browser. Modeled on DSH's `SettingsController`.
 * @module @deepseek-ai/dsh-api-credit-widget/credit/controller
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, deepSeekProvider } from './deepseek.ts'
import type { CreditProvider } from './provider.ts'
import type { CreditSnapshot } from './types.ts'

const FETCH_TIMEOUT_MS = 15_000
const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60_000

/** Deployment configuration for {@link CreditController}. */
export interface Config {
  /** Poll interval in milliseconds. */
  refreshIntervalMs?: number
  /** Credential reference resolved per fetch; shares DSH's key by default. */
  apiKeyEnv?: string
  /** DeepSeek API base URL. */
  baseURL?: string
}

/** Remote owner of the `credit` namespace: polls providers and serves cached snapshots. */
export class CreditController extends TypertRemoteService {
  static Config: z<Config> = z.object({
    refreshIntervalMs: z.number().step(1).min(15_000).default(DEFAULT_REFRESH_INTERVAL_MS),
    apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
    baseURL: z.string(),
  })

  private readonly providers: CreditProvider[]
  private readonly cache = new Map<string, CreditSnapshot>()
  /** Watchers to wake after each refresh, so streams push the new snapshot list. */
  private readonly subscribers = new Set<() => void>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'creditController', { namespace: 'credit' })

    this.providers = [deepSeekProvider({
      ...(config.apiKeyEnv === undefined ? {} : { apiKeyEnv: config.apiKeyEnv }),
      baseURL: config.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL,
    })]

    const interval = config.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    const timer = setInterval(() => {
      void this.refresh()
    }, interval)
    ctx.effect(() => () =>{  clearInterval(timer) })
    // The first fetch runs at boot, when a credential provider may still be
    // warming up and a cold request can time out — retry a few times with a
    // short backoff so a transient startup failure recovers instead of
    // parking the widget on a stale error.
    void this.pollInitial()
  }

  /**
   * Retry the initial refresh a bounded number of times until at least one
   * provider succeeds, so a transient cold-start failure does not stick.
   */
  private async pollInitial(): Promise<void> {
    const maxAttempts = 4
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const results = await this.refresh()
      if (results.some(result => result.ok)) return
      if (attempt + 1 >= maxAttempts) return
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)))
    }
  }

  /**
   * Resolve a credential reference exactly as DSH's DeepSeek adapter does:
   * the credentials seam first, then the launch environment.
   */
  private readonly resolveCredential = async (ref: string): Promise<string | undefined> => {
    const branded = credentialRef(ref)
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(branded)
      if (hit !== undefined) return hit.value
    }
    return launchEnvironmentOf(this.ctx).get(branded)?.value
  }

  /**
   * Every cached snapshot, in provider registration order.
   * @returns snapshots for providers that have fetched at least once.
   */
  @Remote
  list(): CreditSnapshot[] {
    return this.providers
      .map(provider => this.cache.get(provider.vendor))
      .filter((snapshot): snapshot is CreditSnapshot => snapshot !== undefined)
  }

  /**
   * Push the current snapshot list immediately, then again after every refresh.
   * The stream carrier owns `signal`; aborting ends the stream and unsubscribes.
   * @param signal - aborting it ends the stream and unsubscribes.
   * @returns the snapshot list, first immediately, then after each refresh.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<CreditSnapshot[]> {
    yield this.list()
    let wake: (() => void) | undefined
    let pending: CreditSnapshot[] | undefined
    const subscriber = (): void => {
      pending = this.list()
      wake?.()
    }
    this.subscribers.add(subscriber)
    signal.addEventListener('abort', subscriber, { once: true })
    try {
      while (!signal.aborted) {
        if (pending !== undefined) {
          const next = pending
          pending = undefined
          yield next
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      this.subscribers.delete(subscriber)
    }
  }

  /** Wake every active stream watcher with the latest snapshot list. */
  private notify(): void {
    for (const subscriber of [...this.subscribers]) subscriber()
  }

  /**
   * Fetch every provider and refresh the cache.
   * @returns the fresh snapshot per provider, in provider registration order.
   */
  @Remote
  async refresh(): Promise<CreditSnapshot[]> {
    const results = await Promise.all(this.providers.map(async (provider) => {
      let snapshot: CreditSnapshot
      try {
        snapshot = await provider.fetch(
          { resolveCredential: this.resolveCredential },
          AbortSignal.timeout(FETCH_TIMEOUT_MS),
        )
      } catch (error) {
        snapshot = {
          vendor: provider.vendor,
          label: provider.label,
          fetchedAt: new Date().toISOString(),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          balances: [],
        }
      }
      // Keep the last good snapshot on a failed re-fetch; only write an error
      // when there is nothing to show at all (startup), so a transient failure
      // never blanks a working balance with a red error.
      if (snapshot.ok || !this.cache.has(provider.vendor)) {
        this.cache.set(provider.vendor, snapshot)
      }
      return snapshot
    }))
    this.notify()
    return results
  }
}
