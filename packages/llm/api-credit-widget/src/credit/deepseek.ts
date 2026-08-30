/**
 * DeepSeek credit provider. Fetches `GET {baseURL}/user/balance` with the same
 * credential reference DSH's DeepSeek adapter uses (default `DEEPSEEK_API_KEY`).
 * @module @deepseek-ai/dsh-api-credit-widget/credit/deepseek
 */

import type { CreditProvider } from './provider.ts'
import type { CreditBalance, CreditSnapshot } from './types.ts'

export const DEEPSEEK_VENDOR = 'deepseek'
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'

/** Shape returned by the DeepSeek balance endpoint (amounts are strings). */
interface DeepSeekBalanceResponse {
  is_available: boolean
  balance_infos?: Array<{
    currency: string
    total_balance: string
    granted_balance: string
    topped_up_balance: string
  }>
}

export interface DeepSeekProviderOptions {
  /** Credential reference to resolve per fetch; defaults to `DEEPSEEK_API_KEY`. */
  apiKeyEnv?: string
  /** Base URL; defaults to `https://api.deepseek.com`. */
  baseURL?: string
}

/** DeepSeek's top-up page, linked from the widget. */
export const DEEPSEEK_TOP_UP_URL = 'https://platform.deepseek.com/top_up'

/**
 * Stable display order for currency codes, most-preferred first. USD leads as
 * the common quote currency; the order is fixed so the widget's primary figure
 * and balance list never flip between calls. Codes are normalized (trim +
 * upper) before lookup, and an unknown code sorts after every known one,
 * alphabetically, so the order stays deterministic regardless of API casing.
 */
const CURRENCY_PRIORITY = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'HKD', 'KRW', 'CAD', 'AUD', 'SGD', 'credits']

/** Canonical rank for a currency code. */
function currencyRank(currency: string): number {
  const index = CURRENCY_PRIORITY.indexOf(currency.trim().toUpperCase())
  return index === -1 ? CURRENCY_PRIORITY.length : index
}

const failed = (error: string): CreditSnapshot => ({
  vendor: DEEPSEEK_VENDOR,
  label: 'DeepSeek',
  fetchedAt: new Date().toISOString(),
  ok: false,
  error,
  balances: [],
  topUpUrl: DEEPSEEK_TOP_UP_URL,
})

/** Build the DeepSeek {@link CreditProvider}. */
export function deepSeekProvider(options: DeepSeekProviderOptions = {}): CreditProvider {
  const apiKeyEnv = options.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  const baseURL = options.baseURL ?? DEFAULT_BASE_URL

  return {
    vendor: DEEPSEEK_VENDOR,
    label: 'DeepSeek',
    async fetch(fetchCtx, signal): Promise<CreditSnapshot> {
      const key = await fetchCtx.resolveCredential(apiKeyEnv)
      if (key === undefined) {
        return failed(`no API key: resolve "${apiKeyEnv}" through the credentials service or export it in the launching environment`)
      }
      let res: Response
      try {
        res = await fetch(`${baseURL}/user/balance`, {
          headers: { Authorization: `Bearer ${key}` },
          signal,
        })
      } catch (error) {
        return failed(error instanceof Error ? error.message : String(error))
      }
      if (!res.ok) {
        return failed(`balance request failed: HTTP ${res.status}`)
      }
      const body = (await res.json()) as DeepSeekBalanceResponse
      const balances: CreditBalance[] = (body.balance_infos ?? [])
        .map(info => ({
          currency: info.currency,
          total: info.total_balance,
          granted: info.granted_balance,
          toppedUp: info.topped_up_balance,
        }))
        // Deterministic order: USD first, then the fixed priority, then
        // alphabetically — so the list never flips between calls.
        .sort((a, b) => currencyRank(a.currency) - currencyRank(b.currency)
          || a.currency.localeCompare(b.currency))
      return {
        vendor: DEEPSEEK_VENDOR,
        label: 'DeepSeek',
        fetchedAt: new Date().toISOString(),
        ok: true,
        balances,
        topUpUrl: DEEPSEEK_TOP_UP_URL,
      }
    },
  }
}
