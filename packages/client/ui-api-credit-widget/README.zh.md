---
description: "在 Web 会话头部以即时可见的 chip 与弹层渲染 DeepSeek API 余额。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-api-credit-widget

[English](README.md) | 中文

## 概述

`dsh-client-ui-api-credit-widget` 在 Web 会话头部渲染 DeepSeek API 余额。chip 显示一个状态/构成环与主余额；点击后打开一个夹紧在视口内的 portal 弹层，展示各币种明细、granted/topped-up 构成环、最后更新时间与充值链接。它读取生成的 `credit` Remote contribution，不注册任何面向模型的内容。

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

在 Web profile 的 Client 组合中挂载本包，并搭配其 Host 服务 `@deepseek-ai/dsh-api-credit-widget`。它没有用户配置字段；`credit` Remote 命名空间可用后，chip 即出现在会话头部。

### 读取余额

chip 显示主余额（第一个、美元优先的币种），环表示 granted 与 topped-up 的比例。打开弹层可查看所有币种、完整明细、手动刷新与充值链接。缺少密钥时 chip 退化为错误状态，并显示解析到的凭证失败信息。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器入口挂载生成的 `credit` Remote contribution，注册 `credit` locale 命名空间，然后注册一个 `conversation.session.header.utilities` slot。组件通过注入的回调消费实时 `credit/watch` 流并维护自身视图状态，不持有持久状态。Dispose 插件 fiber 会移除 slot、词典与 Remote 挂载。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Remote 挂载、locale 注册、slot 注册 |
| [`src/client/CreditPill.tsx`](src/client/CreditPill.tsx) | chip、弹层、构成环、刷新 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文 chip 文案 |
| [`src/index.ts`](src/index.ts) | 不执行行为的 Host entry |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [API 余额 widget](../../llm/api-credit-widget/README.zh.md)——本 widget 渲染的 Host Remote 服务。
- [Conversation](../../client/ui-conversation/README.zh.md)——声明 `conversation.session.header.utilities` slot 的外壳。
- [UI primitives](../../client/ui-primitives/README.zh.md)——widget 组合使用的 `StateDot`、`Button` 与 `relativeTime`。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响，因为该浏览器 projection 渲染 credit Remote，不改变模型上下文。

#### KV Cache 影响

无直接影响；余额只留在浏览器会话头部，绝不进入 Session 日志或模型历史。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅 DeepSeek**——widget 选取 `deepseek` vendor 快照；其它厂商需要先有 Host 侧 provider。
- **错误优先的呈现**——首次成功拉取前 chip 显示加载状态，拉取失败时显示解析到的错误；不跨会话缓存之前的余额。
- **无低余额告警**——chip 只渲染余额，不触发基于阈值的告警。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
