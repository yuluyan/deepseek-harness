/**
 * Credit-provider capability seam. A provider implements `fetch` for one
 * vendor; the controller owns the registered set. Adding a vendor later = one
 * new provider — the controller and widget do not change.
 * @module @deepseek-ai/dsh-api-credit-widget/credit/provider
 */

import type { CreditSnapshot } from './types.ts'

/** What a provider may ask the host for during a fetch. */
export interface CreditFetchContext {
  /**
   * Resolve a credential reference (an environment-variable-style name such as
   * `DEEPSEEK_API_KEY`) to its current value, through the optional credentials
   * seam with an ambient-environment fallback. Returns `undefined` while
   * unconfigured.
   */
  resolveCredential(ref: string): Promise<string | undefined>
}

/** One vendor's credit fetch implementation. */
export interface CreditProvider {
  /** Stable vendor id, e.g. `deepseek`. */
  readonly vendor: string
  /** Human label, e.g. `DeepSeek`. */
  readonly label: string
  /** Fetch a fresh snapshot. Must resolve (not throw) on provider failure. */
  fetch(fetchCtx: CreditFetchContext, signal: AbortSignal): Promise<CreditSnapshot>
}
