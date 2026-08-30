# Agent Note: API 余额 widget——CreditProvider seam + credit Remote + 侧边栏页脚 pill

Status: implemented

[English](2026-08-29-api-credit-widget.md) | 中文

## 问题

部署方希望在不离开应用的前提下，在 Web GUI 中看到自己的 DeepSeek API 余额，且不把凭证交给浏览器。余额位于 `GET {baseURL}/user/balance`（金额以字符串返回），而浏览器侧无法解析 `dsh-llm-deepseek` 已在使用的 `DEEPSEEK_API_KEY` 凭证。当时既没有 host 服务去轮询并缓存余额，也没有浏览器渲染面。

## 决策

参照 agent-team 先例把功能拆成两半：一个轮询并缓存的 host Remote 服务（`@deepseek-ai/dsh-api-credit-widget`），以及一个渲染侧边栏页脚 pill 的浏览器插件（`@deepseek-ai/dsh-client-ui-api-credit-widget`）。

### CreditProvider capability seam

`CreditProvider`（`packages/llm/api-credit-widget/src/credit/provider.ts`）是厂商 seam：`fetch(fetchCtx, signal)` 总是 resolve（绝不 throw）出一个 `CreditSnapshot`。`CreditFetchContext.resolveCredential(ref)` 先经可选的 credentials 服务、再回退到 launch environment 解析一个凭证引用。controller 拥有注册的 provider 集合；目前只有 `deepSeekProvider` 一个。接入新厂商只需新增一个 provider——controller 与 widget 都不变。

### credit Remote 命名空间

`CreditController extends TypertRemoteService` 拥有 `credit` 命名空间：一元 `list()`（按 provider 顺序返回缓存的快照）与 `refresh()`（拉取所有 provider 并更新缓存），外加一个 `watch(signal)` 流——立即产出当前列表，并在每次刷新后再次产出。它解析密钥的方式与 DSH 的 DeepSeek adapter 完全一致——先 credentials seam，再 launch environment——默认复用 `DEEPSEEK_API_KEY`（`apiKeyEnv` 配置；`baseURL` 默认 `https://api.deepseek.com` 或 `DEEPSEEK_BASE_URL`）。轮询间隔为 `refreshIntervalMs`（默认 300000）。

### 保留上次成功、初次拉取重试、确定性排序

`refresh()` 仅在快照 `ok` 或该 vendor 尚无缓存时才写入，因此瞬时重取失败绝不会用错误状态清空正常余额。构造函数的初次轮询最多重试四次、每次退避 1500ms，使冷启动不会把 widget 停在瞬时错误上。`deepSeekProvider` 用固定的美元优先顺序表归一化币种、未知代码按字母序排后，使主余额数字不会在两次调用间翻转。金额端到端保持字符串（`total`/`granted`/`toppedUp`）——把金额当浮点数是 bug。

### 浏览器 pill

浏览器入口挂载生成的 `credit` Remote contribution，注册 `credit` locale 命名空间（zh/en）并把 `locale: 'credit'` 传给 `slots.register`，随后注册进 `sidebar.footer.action`（`id: 'api-credit-widget'`、`order: 10`、`data-credit-widget="pill"`）。pill 显示一个状态/构成环（granted 绿、topped-up 蓝）加主余额；点击打开一个夹紧在视口内的 portal 弹层，含各币种明细、相对拉取时间与充值链接（`https://platform.deepseek.com/top_up`）。所有文案都经 `t` 席位。

## 考虑过的替代方案

- **直接在浏览器里拉余额**——浏览器侧无法解析凭证，且由 host 轮询+缓存能把拉取挡在每个打开的标签页之外。
- **合并为单一包**——本仓库区分 host 与 client 编译面（agent-team 先例）；合并包会模糊这两个编译面。
- **写死 DeepSeek、不要 provider seam**——seam 是未来 OpenAI/Anthropic provider 接入的唯一位置；写死会让每个新厂商都变成 controller+widget 改动。
- **把金额当浮点数**——DeepSeek 以字符串返回金额，浮点化金额是 bug。
- **重取失败时显示错误**——保留上次成功是用新鲜度换取「绝不把正常余额清空」。

## 后果

密钥解析失败时 widget 退化为本地化的错误状态。保留上次成功意味着在下次成功拉取前 pill 可能显示过期余额（已记入包 README）。字符串金额迫使客户端只有一个解析点（`amountOf`）。seam 是被记录的扩展点：新厂商即新 provider，而 settings 卡片或低余额阈值是延后项，不并入 controller。
