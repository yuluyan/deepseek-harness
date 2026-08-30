/**
 * Browser entry for the credit widget. Mounts the generated `credit` Remote
 * contribution onto `ctx.remote`, registers the `credit` locale namespace,
 * then registers the chip into the session header's
 * `conversation.session.header.actions` slot. Mirrors `client-ui-agent-team`'s
 * mount shape.
 * @module @deepseek-ai/dsh-client-ui-api-credit-widget/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: bring the conversation SlotMap merge (declares `conversation.session.header.actions`).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: bring the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: bring the gateway's `ctx.remote` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: bring the renderer's `ctx.slots` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Runtime value: the Typert-generated Remote contribution for `credit`.
import creditRemote from '@deepseek-ai/dsh-api-credit-widget/remote'
import { CreditPill, type CreditWidgetInjected } from './CreditPill.tsx'
import { en, zh, type CreditWidgetKey } from './locales.ts'

export type { CreditWidgetKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Session-header credit widget copy. */
    credit: CreditWidgetKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'credit'

/** Required browser services: the Remote mount, the slot registry, and the locale registry. */
export const inject = ['remote', 'slots', 'locale']

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

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'api-credit-widget',
    order: 10,
    locale: NS,
    inject: () => injected,
  }, CreditPill))
}

/**
 * Mount the generated `credit` Remote contribution, register its locale
 * dictionaries, then register its browser UI.
 * @param ctx - Client Context carrying the Remote, slot, and locale services.
 * @returns disposer for both the UI registrations and the Remote namespace.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(creditRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-api-credit-widget: dictionaries')
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
