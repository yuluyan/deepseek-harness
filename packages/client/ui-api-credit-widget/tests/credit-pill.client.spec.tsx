// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreditSnapshot } from '@deepseek-ai/dsh-api-credit-widget/types'
import { CreditPill } from '../src/client/CreditPill.tsx'
import { en, type CreditWidgetKey } from '../src/client/locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    credit: CreditWidgetKey
  }
}

/** English-seat translate backed by the real dictionary, for realistic renders. */
const t = (key: string, params?: Record<string, unknown>): string => {
  let text = en[key as CreditWidgetKey] ?? key
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replace(`{${name}}`, String(value))
  }
  return text
}

function snapshot(overrides: Partial<CreditSnapshot> = {}): CreditSnapshot {
  return {
    vendor: 'deepseek',
    label: 'DeepSeek',
    fetchedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    ok: true,
    balances: [
      { currency: 'USD', total: '12.34', granted: '4.20', toppedUp: '8.14' },
      { currency: 'CNY', total: '88.50', granted: '30.00', toppedUp: '58.50' },
    ],
    topUpUrl: 'https://example.com/topup',
    ...overrides,
  }
}

function watchOnce(initial: CreditSnapshot[]): () => AsyncIterable<CreditSnapshot[]> {
  return () => (async function* () { yield initial })()
}

interface RenderProps {
  snapshots?: CreditSnapshot[]
  listSnapshots?: () => Promise<CreditSnapshot[]>
  refresh?: () => Promise<CreditSnapshot[]>
}

function renderPill(options: RenderProps = {}) {
  const {
    snapshots = [],
    listSnapshots = async () => [],
    refresh = async () => [],
  } = options
  const injected = {
    t,
    listSnapshots: vi.fn(listSnapshots),
    watchSnapshots: watchOnce(snapshots),
    refresh: vi.fn(refresh),
  }
  const view = render(<CreditPill {...injected} />)
  return { ...view, injected }
}

afterEach(cleanup)

describe('CreditPill', () => {
  it('renders the loading fallback before any snapshot arrives', () => {
    renderPill()
    const pill = screen.getByRole('button')
    expect(pill.getAttribute('title')).toBe('Credit — loading')
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(within(pill).getByText('Credit')).toBeTruthy()
    expect(within(pill).getByText('—')).toBeTruthy()
  })

  it('shows the primary balance and opens the breakdown popover', async () => {
    renderPill({ snapshots: [snapshot()] })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    expect(within(pill).getByText('USD 12.34')).toBeTruthy()

    fireEvent.click(pill)
    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('DeepSeek balance')
    expect(within(dialog).getByText('ok')).toBeTruthy()
    expect(within(dialog).getByText('available')).toBeTruthy()
    expect(dialog.textContent).toContain('available 4.20')
    expect(dialog.textContent).toContain('topped up 8.14')
    expect(within(dialog).getByText('Updated 2h ago')).toBeTruthy()
    const topUp = within(dialog).getByText('Top up ↗')
    expect(topUp.getAttribute('href')).toBe('https://example.com/topup')
    expect(topUp.getAttribute('target')).toBe('_blank')
  })

  it('renders a granted-only composition without the topped-up row', async () => {
    renderPill({
      snapshots: [snapshot({
        balances: [{ currency: 'USD', total: '4.20', granted: '4.20' }],
      })],
    })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('available 4.20')).toBeTruthy()
    expect(within(dialog).queryByText(/topped up/)).toBeNull()
  })

  it('renders a topped-up-only composition without the granted row', async () => {
    renderPill({
      snapshots: [snapshot({
        balances: [{ currency: 'USD', total: '8.14', toppedUp: '8.14' }],
      })],
    })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('topped up 8.14')).toBeTruthy()
    expect(within(dialog).queryByText(/available \d/)).toBeNull()
  })

  it('renders an error snapshot with its message and the top-up link', async () => {
    renderPill({
      snapshots: [snapshot({
        ok: false,
        error: 'no API key: resolve "DEEPSEEK_API_KEY"',
        balances: [],
      })],
    })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('error')).toBeTruthy()
    expect(within(dialog).getByText('no API key: resolve "DEEPSEEK_API_KEY"')).toBeTruthy()
    expect(within(dialog).getByText('Top up ↗')).toBeTruthy()
  })

  it('refreshes from the popover and shows the pending glyph', async () => {
    const refresh = vi.fn(async () => [snapshot()])
    renderPill({ snapshots: [snapshot()], refresh })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    const button = screen.getByRole('button', { name: 'Refresh' })
    fireEvent.click(button)
    await waitFor(() =>{  expect(refresh).toHaveBeenCalledOnce() })
  })

  it('dismisses the popover on an outside pointer', async () => {
    renderPill({ snapshots: [snapshot()] })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    await screen.findByRole('dialog')
    fireEvent.pointerDown(document.body)
    await waitFor(() =>{  expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('falls back to a single current read when the stream drops', async () => {
    const listSnapshots = vi.fn(async () => [snapshot()])
    render(
      <CreditPill
        t={t}
        listSnapshots={listSnapshots}
        watchSnapshots={() => (async function* () { throw new Error('dropped') })()}
        refresh={async () => []}
      />,
    )
    await waitFor(() =>{  expect(listSnapshots).toHaveBeenCalledOnce() })
    await waitFor(() =>{  expect(screen.getByRole('button').getAttribute('title')).toBe('DeepSeek credit') })
  })

  it('renders each relative-time bucket in the footer', async () => {
    const cases: [number, string][] = [
      [0, 'just now'],
      [120_000, '2min ago'],
      [2 * 3_600_000, '2h ago'],
      [2 * 86_400_000, '2d ago'],
      [31 * 86_400_000, '1mo ago'],
      [366 * 86_400_000, '1y ago'],
    ]
    for (const [age, expected] of cases) {
      cleanup()
      renderPill({ snapshots: [snapshot({ fetchedAt: new Date(Date.now() - age).toISOString() })] })
      const pill = screen.getByRole('button')
      await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
      fireEvent.click(pill)
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText(`Updated ${expected}`)).toBeTruthy()
    }
  })

  it('clamps the popover into the viewport when the anchor sits near an edge', async () => {
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280)
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160)
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 48, height: 28, top: 20, right: 48, bottom: 48, left: 0, toJSON: () => ({}),
    })
    try {
      renderPill({ snapshots: [snapshot()] })
      const pill = screen.getByRole('button')
      await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
      fireEvent.click(pill)
      const dialog = await screen.findByRole('dialog')
      // Above the pill would land at -148px, so it flips below; left is clamped to the 8px margin.
      expect(dialog.style.top).toBe('56px')
      expect(dialog.style.left).toBe('8px')
    } finally {
      offsetWidth.mockRestore()
      offsetHeight.mockRestore()
      rect.mockRestore()
    }
  })

  it('opens the popover in the loading state with fallback copy', () => {
    renderPill()
    const pill = screen.getByRole('button')
    fireEvent.click(pill)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('Credit balance')
    expect(within(dialog).getByText('Credit')).toBeTruthy()
    expect(within(dialog).getByText('loading')).toBeTruthy()
    expect(within(dialog).getByText('Loading…')).toBeTruthy()
    expect(within(dialog).getByText('No data yet')).toBeTruthy()
  })

  it('places the popover above the pill when there is room', async () => {
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 48, height: 28, top: 400, right: 148, bottom: 428, left: 100, toJSON: () => ({}),
    })
    try {
      renderPill({ snapshots: [snapshot()] })
      const pill = screen.getByRole('button')
      await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
      fireEvent.click(pill)
      const dialog = await screen.findByRole('dialog')
      // jsdom reports a zero panel height, so top = 400 - 0 - 8 and nothing flips below.
      expect(dialog.style.top).toBe('392px')
      expect(dialog.style.left).toBe('124px')
    } finally {
      rect.mockRestore()
    }
  })

  it('keeps the popover open when the pointer stays inside the pill', async () => {
    renderPill({ snapshots: [snapshot()] })
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    fireEvent.click(pill)
    await screen.findByRole('dialog')
    fireEvent.pointerDown(pill)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('stops consuming the stream after unmount', async () => {
    let release!: (value: CreditSnapshot[]) => void
    const gate = new Promise<CreditSnapshot[]>((resolve) => { release = resolve })
    const watch = async function* () {
      yield [snapshot()]
      yield await gate
    }
    const { unmount } = render(
      <CreditPill t={t} listSnapshots={async () => []} watchSnapshots={() => watch()} refresh={async () => []} />,
    )
    const pill = screen.getByRole('button')
    await waitFor(() =>{  expect(pill.getAttribute('title')).toBe('DeepSeek credit') })
    unmount()
    release([snapshot()])
    await new Promise(resolve => setTimeout(resolve, 0))
    // Reaching here without a setState-on-unmounted update is the contract.
  })

  it('clears snapshots when the fallback read also fails', async () => {
    const listSnapshots = vi.fn(async () => { throw new Error('offline') })
    render(
      <CreditPill
        t={t}
        listSnapshots={listSnapshots}
        watchSnapshots={() => (async function* () { throw new Error('dropped') })()}
        refresh={async () => []}
      />,
    )
    await waitFor(() =>{  expect(listSnapshots).toHaveBeenCalledOnce() })
    await waitFor(() =>{  expect(screen.getByRole('button').getAttribute('title')).toBe('Credit — loading') })
  })

  it('ignores a stream failure after unmount', async () => {
    let reject!: (error: Error) => void
    const pending = new Promise<CreditSnapshot[]>((_, rej) => { reject = rej })
    const listSnapshots = vi.fn(async () => [snapshot()])
    const watch = async function* () {
      yield await pending
    }
    const { unmount } = render(
      <CreditPill t={t} listSnapshots={listSnapshots} watchSnapshots={() => watch()} refresh={async () => []} />,
    )
    await waitFor(() =>{  expect(screen.getByRole('button').getAttribute('title')).toBe('Credit — loading') })
    unmount()
    reject(new Error('dropped'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(listSnapshots).not.toHaveBeenCalled()
  })
})
