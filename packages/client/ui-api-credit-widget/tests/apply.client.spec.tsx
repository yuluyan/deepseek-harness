/** Client plugin wiring: Remote mount, locale registration, and sidebar slot lifecycle. */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { CreditSnapshot } from '@deepseek-ai/dsh-api-credit-widget/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { CreditPill, type CreditWidgetInjected } from '../src/client/CreditPill.tsx'
import { apply, inject } from '../src/client/index.ts'

class RemoteService extends Service {
  readonly disposeMount = vi.fn(() => Promise.resolve())
  readonly mount = vi.fn((_contribution: unknown) => Promise.resolve(this.disposeMount))

  constructor(serviceCtx: Context) {
    super(serviceCtx, 'remote')
  }

  $mount(contribution: unknown): Promise<() => Promise<void>> {
    return this.mount(contribution)
  }
}

async function bench(options: { registrationFailure?: boolean } = {}) {
  const ctx = new Context()
  const remote = new RemoteService(ctx)
  const list = vi.fn(async (): Promise<RemoteResult<CreditSnapshot[]>> => ({ ok: true, value: [] }))
  const watch = vi.fn(() => (async function* () { yield [] as CreditSnapshot[] })())
  const refresh = vi.fn(async (): Promise<RemoteResult<CreditSnapshot[]>> => ({ ok: true, value: [] }))
  ctx.provide('remote.credit', { list, watch, refresh })
  ctx.provide('locale', new LocaleRuntime(ctx))
  await ctx.plugin(SlotRegistry).await()

  const collapse = ctx.slots.register({
    name: 'root',
    children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  } as never, () => null)

  if (options.registrationFailure === true) {
    vi.spyOn(ctx.slots, 'inject').mockImplementationOnce(() => { throw new Error('slot registration failed') })
  }
  const fiber = options.registrationFailure === true
    ? ctx.plugin({ apply() {} })
    : ctx.plugin({ inject: [...inject], apply })
  const activation = options.registrationFailure === true
    ? apply(ctx).catch((error: unknown) => error)
    : fiber.await()
  if (options.registrationFailure !== true) await activation
  else await fiber.await()

  const entry = () => ctx.slots.entries('sidebar.footer.action')
    .find(candidate => candidate.component === CreditPill)
  return { ctx, fiber, activation, remote, entry, collapse, list, watch, refresh }
}

describe('ui-api-credit-widget apply', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['remote', 'slots', 'locale'])
  })

  it('mounts the credit Remote, registers dictionaries, and registers the footer action', async () => {
    const b = await bench()
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.mount.mock.calls[0]?.[0]).toMatchObject({
      package: '@deepseek-ai/dsh-api-credit-widget',
    })
    expect(b.entry()).toMatchObject({
      options: { id: 'api-credit-widget', order: 10 },
      locale: 'credit',
    })

    const actions = (b.entry()!.inject as unknown as () => CreditWidgetInjected)()
    await actions.listSnapshots()
    expect(b.list).toHaveBeenCalledOnce()
    actions.watchSnapshots(new AbortController().signal)
    expect(b.watch).toHaveBeenCalledOnce()
    await actions.refresh()
    expect(b.refresh).toHaveBeenCalledOnce()

    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('unmounts the Remote contribution when slot registration fails', async () => {
    const b = await bench({ registrationFailure: true })
    await expect(b.activation).resolves.toMatchObject({ message: 'slot registration failed' })
    expect(b.remote.mount).toHaveBeenCalledOnce()
    expect(b.remote.disposeMount).toHaveBeenCalledOnce()
  })

  it('re-registers after the footer action slot collapses and is declared again', async () => {
    const b = await bench()
    expect(b.entry()).toBeDefined()
    b.collapse()
    expect(b.entry()).toBeUndefined()
    b.ctx.slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.entry()).toBeDefined()
  })

  it('returns an empty list when the Remote carrier reports failure', async () => {
    const b = await bench()
    const failure = { ok: false as const, error: new RemoteError('gateway/internal', 'offline', {}) }
    b.list.mockResolvedValueOnce(failure)
    b.refresh.mockResolvedValueOnce(failure)
    const actions = (b.entry()!.inject as unknown as () => CreditWidgetInjected)()
    expect(await actions.listSnapshots()).toEqual([])
    expect(await actions.refresh()).toEqual([])
  })
})
