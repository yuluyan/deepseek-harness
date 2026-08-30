---
description: "Poll the DeepSeek API credit balance and expose it to the Web GUI as a generated Remote service."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-credit-widget

English | [中文](README.zh.md)

## Summary

`dsh-api-credit-widget` polls DeepSeek's `GET /user/balance` endpoint and exposes each provider's latest credit snapshot to the browser through a generated `credit` Remote namespace — unary `list` and `refresh` plus a live `watch` stream. It resolves the same `DEEPSEEK_API_KEY` credential as `dsh-llm-deepseek`, retries the initial fetch with a short backoff so a cold start does not stick on an error, keeps the last good snapshot when a re-fetch fails, and orders currencies deterministically with USD first. It registers nothing model-facing; the session-header widget renders its output.

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

Mount the package in the Host composition of a Web profile alongside its browser widget, `@deepseek-ai/dsh-client-ui-api-credit-widget`. The DeepSeek provider reuses the `DEEPSEEK_API_KEY` credential already used by `dsh-llm-deepseek`; set the optional `baseURL` field (or `DEEPSEEK_BASE_URL`) to point the balance fetch elsewhere.

| Field | Default | Meaning |
|---|---|---|
| `refreshIntervalMs` | `300000` | Poll interval in milliseconds |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference resolved per fetch |
| `baseURL` | `https://api.deepseek.com` | DeepSeek API base URL |

The generated [configuration catalog](../../../docs/config-catalog.md) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The controller is a `TypertRemoteService` that owns the `credit` namespace. It builds one `deepSeekProvider` behind the `CreditProvider` seam, polls on a fixed interval, and caches the latest snapshot per vendor. `refresh` fetches every provider concurrently; a failed re-fetch keeps the cached good snapshot so the widget never blanks a working balance. `watch` yields the current list immediately and again after every refresh.

| File | Role |
|---|---|
| [`src/credit/controller.ts`](src/credit/controller.ts) | Remote owner: polling, cache, keep-last-good, stream |
| [`src/credit/deepseek.ts`](src/credit/deepseek.ts) | DeepSeek balance fetch, currency ordering, top-up URL |
| [`src/credit/provider.ts`](src/credit/provider.ts) | `CreditProvider` capability seam |
| [`src/credit/types.ts`](src/credit/types.ts) | JSON-safe snapshot vocabulary |
| [`src/index.ts`](src/index.ts) | Package entry and re-exports |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Browser credit widget](../../client/ui-api-credit-widget/README.md) — the session-header chip and popover that render this service.
- [DeepSeek adapter](../../llm/llm-deepseek/README.md) — the provider whose credential and base URL this package reuses.

-----

<a id="model-experience"></a>
## Model Experience

None, as the balance poller and its Remote surface register no model-facing input.

#### KV Cache effect

No direct effect; credit balances are rendered only in the browser session header and never enter model context.

## Known Limitations and Deferred Work

- **DeepSeek only** — the controller ships one provider behind the `CreditProvider` seam; another vendor needs a new provider implementation.
- **Polling, not push** — snapshots update on the fixed interval and an explicit refresh; there is no server-push balance event.
- **Keep-last-good staleness** — a failed re-fetch leaves the last good snapshot visible, so the widget can show a stale balance until the next successful fetch.
- **Single credential** — the DeepSeek provider resolves one `apiKeyEnv` reference; it does not model per-vendor credentials or usage-history paging.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
