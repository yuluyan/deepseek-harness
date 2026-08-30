---
description: "轮询 DeepSeek API 余额并通过生成的 Remote 服务暴露给 Web 侧边栏。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-credit-widget

[English](README.md) | 中文

## 概述

`dsh-api-credit-widget` 轮询 DeepSeek 的 `GET /user/balance` 接口，并通过生成的 `credit` Remote 命名空间把每个 provider 的最新余额快照暴露给浏览器——包括一元 `list`、`refresh` 以及实时 `watch` 流。它复用 `dsh-llm-deepseek` 所使用的同一 `DEEPSEEK_API_KEY` 凭证，冷启动时用短退避重试初次拉取以避免停留在错误状态，重取失败时保留上一次成功的快照，并按确定性顺序（美元优先）排列币种。它不注册任何面向模型的输入；其输出由侧边栏 widget 渲染。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在 Web profile 的 Host 组合中挂载本包，并搭配其浏览器 widget `@deepseek-ai/dsh-client-ui-api-credit-widget`。DeepSeek provider 复用 `dsh-llm-deepseek` 已使用的 `DEEPSEEK_API_KEY` 凭证；如需把余额请求指向别处，可设置可选的 `baseURL` 字段（或 `DEEPSEEK_BASE_URL`）。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `refreshIntervalMs` | `300000` | 轮询间隔（毫秒） |
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 每次拉取时解析的凭证引用 |
| `baseURL` | `https://api.deepseek.com` | DeepSeek API 基础 URL |

生成的 [配置目录](../../../docs/config-catalog.zh.md) 是每个已接受字段的权威来源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

controller 是一个拥有 `credit` 命名空间的 `TypertRemoteService`。它在 `CreditProvider` seam 之后构造一个 `deepSeekProvider`，按固定间隔轮询，并按 vendor 缓存最新快照。`refresh` 并发拉取所有 provider；重取失败时保留已缓存的成功快照，使 widget 不会清空正常余额。`watch` 立即产出当前列表，并在每次刷新后再次产出。

| 文件 | 职责 |
|---|---|
| [`src/credit/controller.ts`](src/credit/controller.ts) | Remote 宿主：轮询、缓存、保留上次成功、流 |
| [`src/credit/deepseek.ts`](src/credit/deepseek.ts) | DeepSeek 余额拉取、币种排序、充值链接 |
| [`src/credit/provider.ts`](src/credit/provider.ts) | `CreditProvider` 能力 seam |
| [`src/credit/types.ts`](src/credit/types.ts) | JSON 安全的快照词汇 |
| [`src/index.ts`](src/index.ts) | 包入口与再导出 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [浏览器余额 widget](../../client/ui-api-credit-widget/README.zh.md)——渲染本服务的侧边栏 pill 与弹层。
- [DeepSeek adapter](../../llm/llm-deepseek/README.zh.md)——本包复用的凭证与 base URL 所属的 provider。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响，因为该余额轮询器与 Remote 表面不注册面向模型的输入。

#### KV Cache 影响

无直接影响；余额只渲染在浏览器页脚，绝不进入模型上下文。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅 DeepSeek**——controller 在 `CreditProvider` seam 之后只内置一个 provider；接入其它厂商需要新增 provider 实现。
- **轮询而非推送**——快照按固定间隔与显式刷新更新，没有服务端推送的余额事件。
- **保留上次成功的陈旧性**——重取失败时保留上次成功快照，因此在下次成功前 widget 可能显示过期余额。
- **单一凭证**——DeepSeek provider 只解析一个 `apiKeyEnv` 引用，不建模多厂商凭证或用量历史分页。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
