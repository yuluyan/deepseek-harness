---
description: "在 Web 侧边栏页脚以 pill 与弹层渲染 DeepSeek API 余额。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-api-credit-widget

[English](README.md) | 中文

## Summary

`dsh-client-ui-api-credit-widget` 在 Web 侧边栏页脚渲染 DeepSeek API 余额。pill 显示一个状态/构成环与主余额；点击后打开一个夹紧在视口内的 portal 弹层，展示各币种明细、granted/topped-up 构成环、最后更新时间与充值链接。它读取生成的 `credit` Remote contribution，不注册任何面向模型的内容。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

在 Web profile 的 Client 组合中挂载本包，并搭配其 Host 服务 `@deepseek-ai/dsh-api-credit-widget`。它没有用户配置字段；`credit` Remote 命名空间可用后，pill 即出现在侧边栏页脚。

### Read the balance

pill 显示主余额（第一个、美元优先的币种），环表示 granted 与 topped-up 的比例。打开弹层可查看所有币种、完整明细、手动刷新与充值链接。缺少密钥时 pill 退化为错误状态，并显示解析到的凭证失败信息。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>实现细节 — 点击展开</summary>

浏览器入口挂载生成的 `credit` Remote contribution，注册 `credit` locale 命名空间，然后注册一个 `sidebar.footer.action` slot。组件通过注入的回调消费实时 `credit/watch` 流并维护自身视图状态，不持有持久状态。Dispose 插件 fiber 会移除 slot、词典与 Remote 挂载。

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Remote 挂载、locale 注册、slot 注册 |
| [`src/client/CreditPill.tsx`](src/client/CreditPill.tsx) | pill、弹层、构成环、刷新 |
| [`src/client/locales.ts`](src/client/locales.ts) | 英文与中文 pill 文案 |
| [`src/index.ts`](src/index.ts) | 无操作的 Host 入口 |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [API 余额 widget](../../llm/api-credit-widget/README.md) — 本 widget 渲染的 Host Remote 服务。
- [Sidebar](../../client/ui-sidebar/README.md) — 声明 `sidebar.footer.action` slot 的外壳。
- [UI primitives](../../client/ui-primitives/README.md) — widget 组合使用的 `StateDot`、`Button` 与 `relativeTime`。

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection renders the credit Remote without changing model context.

#### KV Cache effect

No direct effect; credit balances stay in the browser footer and never enter the Session log or model history.

## Known Limitations and Deferred Work

- **仅 DeepSeek** — widget 选取 `deepseek` vendor 快照；其它厂商需要先有 Host 侧 provider。
- **错误优先的呈现** — 首次成功拉取前 pill 显示加载状态，拉取失败时显示解析到的错误；不跨会话缓存之前的余额。
- **无低余额告警** — pill 只渲染余额，不触发基于阈值的告警。
