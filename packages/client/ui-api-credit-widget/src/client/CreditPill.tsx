/**
 * Sidebar credit pill + popover. Registered into `sidebar.footer.action`; the
 * pill shows a status/composition ring and the primary balance, and a click
 * opens a viewport-clamped, portaled card with the full breakdown.
 *
 * Rendered from `remote.credit`, styled with `--dsw-*` tokens and DSH
 * primitives (StateDot, Button, relativeTime) to match the product's language.
 * @module @deepseek-ai/dsh-client-ui-api-credit-widget/client
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Button, StateDot, relativeTime } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CreditBalance, CreditSnapshot } from '@deepseek-ai/dsh-api-credit-widget/types'
import css from './CreditPill.module.css'

export interface CreditWidgetInjected {
  /** Latest cached snapshots from `remote.credit.list()`. */
  listSnapshots(): Promise<CreditSnapshot[]>
  /** Live snapshot stream from `remote.credit.watch()`. */
  watchSnapshots(signal: AbortSignal): AsyncIterable<CreditSnapshot[]>
  /** Force a refresh from `remote.credit.refresh()`. */
  refresh(): Promise<CreditSnapshot[]>
}

interface CreditPillProps extends CreditWidgetInjected {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide: boolean
}

type Status = 'loading' | 'ok' | 'error'

/** StateDot maps: DSH's four dot states → our three statuses. */
const DOT_STATE: Record<Status, 'done' | 'error' | 'ongoing'> = {
  ok: 'done',
  error: 'error',
  loading: 'ongoing',
}

function amountOf(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

/** Primary balance: the provider already ordered currencies (USD first), so the first entry leads. */
function pickPrimary(balances: readonly CreditBalance[]): CreditBalance | undefined {
  return balances[0]
}

function statusOf(snapshot: CreditSnapshot | undefined): Status {
  if (snapshot === undefined) return 'loading'
  return snapshot.ok ? 'ok' : 'error'
}

function primaryLabel(balance: CreditBalance | undefined): string {
  return balance === undefined ? '—' : `${balance.currency} ${balance.total}`
}

function relativeLabel(iso: string): string {
  const { unit, n } = relativeTime(Date.parse(iso), Date.now())
  if (unit === 'now') return 'just now'
  if (unit === 'minutes') return `${n}min ago`
  if (unit === 'hours') return `${n}h ago`
  if (unit === 'days') return `${n}d ago`
  if (unit === 'months') return `${n}mo ago`
  return `${n}y ago`
}

/** Composition ring: granted (green) + topped-up (blue); a single status ring when no breakdown. */
function Ring({ balance, size, status }: { balance: CreditBalance | undefined; size: number; status: Status }) {
  const stroke = size >= 56 ? 7 : size >= 18 ? 4 : 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2
  const granted = amountOf(balance?.granted)
  const topped = amountOf(balance?.toppedUp)
  const denominator = granted + topped
  const hasBreakdown = denominator > 0
  const grantedFrac = hasBreakdown ? granted / denominator : 1
  const toppedFrac = hasBreakdown ? topped / denominator : 0

  const data = balance === undefined ? status : 'composition'

  return (
    <svg
      className={css.ring}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-hidden="true"
      data-ring={data}
    >
      <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={css.ringTrack} />
      {hasBreakdown && granted > 0 && (
        <circle
          cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={css.ringGranted}
          strokeDasharray={`${grantedFrac * circumference} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
          strokeLinecap="butt"
        />
      )}
      {hasBreakdown && topped > 0 && (
        <circle
          cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={css.ringTopped}
          strokeDasharray={`${toppedFrac * circumference} ${circumference}`}
          strokeDashoffset={-grantedFrac * circumference}
          transform={`rotate(-90 ${center} ${center})`}
          strokeLinecap="butt"
        />
      )}
      {!hasBreakdown && (
        <circle
          cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke}
          className={css.ringStatus}
          data-status={status}
          strokeDasharray={`${circumference} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </svg>
  )
}

function BalanceRows({ snapshot }: { snapshot: CreditSnapshot }) {
  return (
    <div className={css.rows}>
      {snapshot.balances.map(balance => (
        <div key={balance.currency} className={css.row}>
          <span className={css.rowCur}>{balance.currency}</span>
          <span className={css.rowTotal}>{balance.total}</span>
          <span className={css.rowMeta}>
            {balance.granted !== undefined ? `available ${balance.granted}` : ''}
            {balance.granted !== undefined && balance.toppedUp !== undefined ? ' · ' : ''}
            {balance.toppedUp !== undefined ? `topped up ${balance.toppedUp}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function CreditPill({ wide, listSnapshots, watchSnapshots, refresh }: CreditPillProps) {
  const [snapshots, setSnapshots] = useState<CreditSnapshot[]>([])
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const snapshot = snapshots.find(candidate => candidate.vendor === 'deepseek') ?? snapshots[0]
  const status = statusOf(snapshot)
  const primary = pickPrimary(snapshot?.balances ?? [])
  const primaryText = primaryLabel(primary)

  // Subscribe to the live snapshot stream: it yields the current list
  // immediately, then again whenever the host finishes a poll or a refresh.
  useEffect(() => {
    const abort = new AbortController()
    let disposed = false
    const consume = async () => {
      try {
        for await (const next of watchSnapshots(abort.signal)) {
          if (disposed) break
          setSnapshots(next)
        }
      } catch {
        // Stream ended (transport drop): fall back to a single current read.
        if (!disposed) {
          void listSnapshots().then(setSnapshots).catch(() => setSnapshots([]))
        }
      }
    }
    void consume()
    return () => {
      disposed = true
      abort.abort()
    }
  }, [watchSnapshots, listSnapshots])

  const doRefresh = () => {
    setRefreshing(true)
    void refresh().then(setSnapshots).finally(() => setRefreshing(false))
  }

  // Portaled card placement: prefer above the pill, clamp into the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const place = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (anchor === null || panel === null) return
      const rect = anchor.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const margin = 8
      const gap = 8
      let left = rect.left + rect.width / 2 - width / 2
      let top = rect.top - height - gap
      if (top < margin) top = rect.bottom + gap
      if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin)
      if (height > 0) top = Math.min(Math.max(top, margin), window.innerHeight - height - margin)
      setPosition({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Dismiss on outside pointer (the panel is portaled, so check both refs).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target !== null && !anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={css.pill}
        data-wide={wide}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        title={snapshot === undefined ? 'Credit — loading' : `${snapshot.label} credit`}
      >
        <span className={css.pillRing}>
          <Ring balance={primary} size={wide ? 16 : 18} status={status} />
        </span>
        {wide && (
          <span className={css.pillLabel}>
            <span className={css.pillVendor}>{snapshot?.label ?? 'Credit'}</span>
            <span className={css.pillAmount}>{primaryText}</span>
          </span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className={css.popover}
          style={position ?? undefined}
          role="dialog"
          aria-label={`${snapshot?.label ?? 'Credit'} balance`}
        >
          <header className={css.popHeader}>
            <StateDot state={DOT_STATE[status]} size={10} />
            <span className={css.popTitle}>{snapshot?.label ?? 'Credit'}</span>
            <span className={css.popStatus} data-status={status}>{status}</span>
            <Button variant="ghost" size="sm" aria-label="Refresh" onClick={doRefresh} disabled={refreshing}>
              {refreshing ? '…' : '↻'}
            </Button>
          </header>

          <div className={css.popBody}>
            <div className={css.popGauge}>
              <Ring balance={primary} size={72} status={status} />
              <div className={css.popGaugeCenter}>
                <span className={css.popGaugeAmount}>{primaryText}</span>
                <span className={css.popGaugeCaption}>available</span>
              </div>
            </div>
            <div className={css.popRows}>
              {snapshot === undefined
                ? <span className={css.empty}>Loading…</span>
                : snapshot.ok
                  ? <BalanceRows snapshot={snapshot} />
                  : <span className={css.errorText}>{snapshot.error}</span>}
            </div>
          </div>

          <footer className={css.popFooter}>
            <span>{snapshot === undefined ? 'No data yet' : `Updated ${relativeLabel(snapshot.fetchedAt)}`}</span>
            {snapshot?.topUpUrl !== undefined && (
              <a className={css.topUpLink} href={snapshot.topUpUrl} target="_blank" rel="noreferrer">
                Top up ↗
              </a>
            )}
          </footer>
        </div>,
        document.body,
      )}
    </>
  )
}
