/**
 * Shared, JSON-safe credit vocabulary. Imported by the Host Remote surface and
 * (type-only) by the browser widget, so nothing here may reference a Host-only
 * symbol. Amounts stay strings: DeepSeek returns them as strings and float-ing
 * money is a bug.
 * @module @deepseek-ai/dsh-api-credit-widget/types
 */

/** One normalized money/credit balance. */
export interface CreditBalance {
  /** ISO currency code (`USD`, `CNY`) or a provider unit such as `credits`. */
  currency: string
  /** Total available now (granted + topped-up). */
  total: string
  /** Not-yet-expired granted balance. */
  granted?: string
  /** User-purchased (topped-up) balance. */
  toppedUp?: string
}

/** Optional current-period usage, when a vendor exposes it. */
export interface UsageSummary {
  periodStart?: string
  periodEnd?: string
  spendTotal?: string
  requests?: number
  inputTokens?: number
  outputTokens?: number
}

/**
 * One vendor's latest credit snapshot. `ok:false` + `error` is the normalized
 * degraded state (no key, HTTP failure, parse failure) the widget renders.
 */
export interface CreditSnapshot {
  /** Stable vendor id, e.g. `deepseek`. */
  vendor: string
  /** Human label, e.g. `DeepSeek`. */
  label: string
  /** ISO timestamp of the fetch. */
  fetchedAt: string
  ok: boolean
  /** Present when `ok` is false. */
  error?: string
  balances: CreditBalance[]
  usage?: UsageSummary
  /** Where to top up this vendor's credit, when the vendor exposes a page. */
  topUpUrl?: string
}
