---
description: "Render the DeepSeek API credit balance in the Web sidebar footer as a pill and popover."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-api-credit-widget

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-api-credit-widget` renders the DeepSeek API credit balance in the Web sidebar footer. A pill shows a status/composition ring plus the primary balance; clicking it opens a viewport-clamped, portaled popover with the full per-currency breakdown, a granted/topped-up composition ring, the last-updated time, and a top-up link. It reads the generated `credit` Remote contribution and registers nothing model-facing.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in the Client composition of a Web profile alongside its Host service, `@deepseek-ai/dsh-api-credit-widget`. It has no user configuration fields; the pill appears in the sidebar footer once the `credit` Remote namespace is available.

### Read the balance

The pill shows the primary balance (the first, USD-first currency) with a ring encoding granted versus topped-up credit. Open the popover for every currency, the full breakdown, a manual refresh, and the top-up link. Without a key the pill degrades to an error state with the resolved credential's failure message.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser entry mounts the generated `credit` Remote contribution, registers the `credit` locale namespace, then registers one `sidebar.footer.action` slot. The component consumes the live `credit/watch` stream through injected callbacks and keeps its own view state; it holds no durable state. Disposing the plugin fiber removes the slot, the dictionaries, and the Remote mount.

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Remote mount, locale registration, slot registration |
| [`src/client/CreditPill.tsx`](src/client/CreditPill.tsx) | Pill, popover, composition ring, refresh |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese pill copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [API credit widget](../../llm/api-credit-widget/README.md) — the Host Remote service this widget renders.
- [Sidebar](../../client/ui-sidebar/README.md) — the shell that declares the `sidebar.footer.action` slot.
- [UI primitives](../../client/ui-primitives/README.md) — the `StateDot`, `Button`, and `relativeTime` pieces the widget composes.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection renders the credit Remote without changing model context.

#### KV Cache effect

No direct effect; credit balances stay in the browser footer and never enter the Session log or model history.

## Known Limitations and Deferred Work

- **DeepSeek only** — the widget selects the `deepseek` vendor snapshot; other vendors need Host-side providers first.
- **Error-first presentation** — before the first successful fetch the pill shows a loading state, and a failed fetch shows the resolved error; there is no offline cache of a prior balance across sessions.
- **No low-balance warning** — the pill renders the balance but raises no threshold-based warning.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
