/** `credit` namespace dictionaries: sidebar pill and popover copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'pill.loading': '余额 — 加载中',
  'pill.title': '{label} 余额',
  'pill.fallback': '余额',
  'status.ok': '正常',
  'status.error': '异常',
  'status.loading': '加载中',
  'action.refresh': '刷新',
  'dialog.label': '{label} 余额',
  'gauge.available': '可用',
  'balance.granted': '可用 {amount}',
  'balance.toppedUp': '充值 {amount}',
  'body.loading': '加载中…',
  'footer.noData': '暂无数据',
  'footer.updated': '更新于 {time}',
  'footer.topUp': '充值 ↗',
  'time.now': '刚刚',
  'time.minutes': '{n}分钟前',
  'time.hours': '{n}小时前',
  'time.days': '{n}天前',
  'time.months': '{n}个月前',
  'time.years': '{n}年前',
} satisfies Record<string, string>

/** The credit namespace key union. */
export type CreditWidgetKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'pill.loading': 'Credit — loading',
  'pill.title': '{label} credit',
  'pill.fallback': 'Credit',
  'status.ok': 'ok',
  'status.error': 'error',
  'status.loading': 'loading',
  'action.refresh': 'Refresh',
  'dialog.label': '{label} balance',
  'gauge.available': 'available',
  'balance.granted': 'available {amount}',
  'balance.toppedUp': 'topped up {amount}',
  'body.loading': 'Loading…',
  'footer.noData': 'No data yet',
  'footer.updated': 'Updated {time}',
  'footer.topUp': 'Top up ↗',
  'time.now': 'just now',
  'time.minutes': '{n}min ago',
  'time.hours': '{n}h ago',
  'time.days': '{n}d ago',
  'time.months': '{n}mo ago',
  'time.years': '{n}y ago',
} satisfies Record<CreditWidgetKey, string>
