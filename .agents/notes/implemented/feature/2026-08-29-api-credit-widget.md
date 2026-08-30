# Agent Note: API credit widget — CreditProvider seam + credit Remote + session header chip

Status: implemented

English | [中文](2026-08-29-api-credit-widget.zh.md)

## Problem

A deployment wants its DeepSeek API credit/balance visible in the web GUI without leaving the app, and without handing the browser a credential. The balance lives behind `GET {baseURL}/user/balance` (amounts returned as strings), and the browser half cannot resolve the `DEEPSEEK_API_KEY` credential that `dsh-llm-deepseek` already uses. There was no host service to poll and cache the balance and no browser surface to render it.

## Decision

Split the feature like the agent-team precedent: a host Remote service (`@deepseek-ai/dsh-api-credit-widget`) that polls and caches, and a browser plugin (`@deepseek-ai/dsh-client-ui-api-credit-widget`) that renders a session-header chip.

### CreditProvider capability seam

`CreditProvider` (`packages/llm/api-credit-widget/src/credit/provider.ts`) is the vendor seam: `fetch(fetchCtx, signal)` resolves (never throws) to a `CreditSnapshot`. `CreditFetchContext.resolveCredential(ref)` resolves a credential reference through the optional credentials service, falling back to the launch environment. The controller owns the registered set; `deepSeekProvider` is the only provider today. Adding a vendor is one new provider — the controller and widget do not change.

### credit Remote namespace

`CreditController extends TypertRemoteService` owns the `credit` namespace: unary `list()` (cached snapshots, provider order) and `refresh()` (fetch every provider, update the cache), plus a `watch(signal)` stream that yields the current list immediately and again after every refresh. It resolves the key exactly like DSH's DeepSeek adapter — credentials seam first, then launch environment — and reuses `DEEPSEEK_API_KEY` by default (`apiKeyEnv` config; `baseURL` defaults to `https://api.deepseek.com` or `DEEPSEEK_BASE_URL`). The poll interval is `refreshIntervalMs` (default 300000).

### Keep-last-good, initial-fetch retry, deterministic ordering

`refresh()` writes a snapshot only when it is `ok` or the vendor has nothing cached, so a transient re-fetch failure never blanks a working balance with an error. The constructor's initial poll retries up to four times with a 1500ms-per-attempt backoff so a cold start does not park the widget on a transient error. `deepSeekProvider` normalizes currencies with a fixed USD-first priority list, then alphabetically for unknown codes, so the primary figure never flips between calls. Amounts stay strings end-to-end (`total`/`granted`/`toppedUp`) — float-ing money is a bug.

### Browser chip

The browser entry mounts the generated `credit` Remote contribution, registers a `credit` locale namespace (zh/en) and passes `locale: 'credit'` to `slots.register`, then registers `conversation.session.header.utilities` (`id: 'api-credit-widget'`, `order: 10`, `data-credit-widget="pill"`). The chip shows a status/composition ring (granted green, topped-up blue) plus the primary balance; clicking opens a viewport-clamped portaled popover with the per-currency breakdown, the relative fetch time, and the top-up link (`https://platform.deepseek.com/top_up`). All copy rides the `t` seat.

## Alternatives considered

- **Fetch the balance directly in the browser** — the browser half cannot resolve the credential, and a host-owned poll+cache keeps the fetch out of every open tab.
- **One combined package** — the repo splits host and client faces (the agent-team precedent); a combined package would blur the two compiler faces.
- **Hardcode DeepSeek, no provider seam** — the seam is the one place future OpenAI/Anthropic providers plug in; hardcoding would make each new vendor a controller-and-widget change.
- **Float the amounts** — DeepSeek returns amounts as strings and float-ing money is a bug.
- **Show the error on a failed re-fetch** — keep-last-good trades freshness for never blanking a working balance.

## Consequences

The widget degrades to a localized error state when no key resolves. Keep-last-good means the pill can show a stale balance until the next successful fetch (documented in the package README). String amounts force one client parse point (`amountOf`). The seam is the recorded extension point: a new vendor is a new provider, and a settings card or a low-balance threshold are deferred, not folded into the controller.
