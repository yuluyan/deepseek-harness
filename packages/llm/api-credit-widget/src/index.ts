/**
 * Host plugin entry for `api-credit-widget`. The package default export is the
 * {@link CreditController} Remote service; the Loader mounts it as a row and the
 * Typert loader registers its generated `/typert` host face automatically.
 * @module @deepseek-ai/dsh-api-credit-widget
 */

import { CreditController } from './credit/controller.ts'

export { CreditController }
export type { Config } from './credit/controller.ts'
export type { CreditSnapshot, CreditBalance, UsageSummary } from './credit/types.ts'
export type { CreditProvider, CreditFetchContext } from './credit/provider.ts'

export default CreditController
