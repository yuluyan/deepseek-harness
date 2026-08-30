/**
 * Browser entry for the credit widget. Mounts the generated `credit` Remote
 * contribution onto `ctx.remote`, then registers the pill into the sidebar's
 * `sidebar.footer.action` slot. Mirrors `client-ui-agent-team`'s mount shape.
 * @module @deepseek-ai/dsh-client-ui-api-credit-widget/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: bring the sidebar SlotMap merge (declares `sidebar.footer.action`).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: bring the gateway's `ctx.remote` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: bring the renderer's `ctx.slots` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Runtime value: the Typert-generated Remote contribution for `credit`.
import creditRemote from '@deepseek-ai/dsh-api-credit-widget/remote'
import { CreditPill, type CreditWidgetInjected } from './CreditPill.tsx'

/** Required browser services: the Remote mount + the slot registry. */
export const inject = ['remote', 'slots']

function registerUi(ctx: ClientContext): void {
  const injected: CreditWidgetInjected = {
    listSnapshots: async () => {
      const result = await ctx.remote.credit.list()
      return result.ok ? result.value : []
    },
    watchSnapshots: signal => ctx.remote.credit.watch(signal),
    refresh: async () => {
      const result = await ctx.remote.credit.refresh()
      return result.ok ? result.value : []
    },
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'api-credit-widget',
    order: 10,
    inject: () => injected,
  }, CreditPill))
}

/**
 * Mount the generated `credit` Remote contribution, then register its browser UI.
 * @param ctx - Client Context carrying the Remote and slot services.
 * @returns disposer for both the UI registrations and the Remote namespace.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(creditRemote)
  const ui = ctx.inject(['remote.credit', 'slots'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await disposeRemote()
  }
}
