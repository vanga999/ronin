# AI Assist

首页右上角的 `AI Assist` 可以连接一个 OpenAI-compatible Chat Completions 接口，并基于当前本地数据进行问答。

## 支持的配置

| 配置 | 示例 | 说明 |
| --- | --- | --- |
| 服务名称 | `OpenAI-compatible` | 仅用于界面识别 |
| 模型地址 | `https://api.openai.com/v1` | 后端会自动拼接 `/chat/completions` |
| 模型名称 | `gpt-4o-mini` | 由服务商提供 |
| API Key | `sk-...` | 本机 Ollama 等无鉴权服务可以留空 |

因此可以切换 OpenAI、DeepSeek、OpenRouter、Ollama 以及其他兼容该协议的模型服务。更换服务时只需修改地址、模型名称和 Key，不需要改代码。

## 对话上下文

每次对话请求会由服务端重新读取当前数据库，提供以下摘要：

- 当前资产、累计投入、持有收益和投资总账；
- 开放持仓批次、正式净值日期、当前市值和收益率；
- 当前账户与基金纪律信号及触发原因。

盘中估算不会被当作正式收益，系统提示词会要求模型区分两者。对话历史只保留在当前页面会话中，不会额外写入数据库。

## 安全边界

- API Key 保存在本地 SQLite 的 `ai_assistant_setting` 表中，不会通过设置查询接口返回原文。
- 为避免把密钥带入导出文件，完整 JSON 备份不会包含 AI 配置；恢复备份后需要重新设置模型。
- 当前项目没有登录和权限控制，不要把应用暴露到公网，也不要在共享机器上配置个人 Key。
- 模型请求会把当前投资数据发送到你配置的第三方服务；请先确认服务商的隐私政策和数据处理方式。
- AI 回答只是辅助解释，不会自动下单，也不替代基金平台的实际净值、费率和交易确认。

## 兼容性约定

后端调用：

```http
POST {baseUrl}/chat/completions
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

请求使用 `model`、`messages`、`temperature` 和 `stream: false` 字段，并读取标准响应中的 `choices[0].message.content`。本机服务若不需要鉴权，可以不填写 API Key。
