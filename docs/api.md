# API 参考

所有接口默认服务于同一个本地数据库。当前没有认证层，不要把 API 直接暴露到公网。

## 资源接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET`, `POST` | `/api/accounts` | 查询或创建账户 |
| `PATCH`, `DELETE` | `/api/accounts/:id` | 修改或删除账户及关联数据 |
| `GET`, `POST` | `/api/instruments` | 查询或创建基金 |
| `PATCH`, `DELETE` | `/api/instruments/:id` | 修改或删除基金及关联数据 |
| `GET`, `POST` | `/api/position-lots` | 查询或创建买入批次 |
| `PATCH`, `DELETE` | `/api/position-lots/:id` | 修改或删除未发生赎回的批次 |
| `GET` | `/api/transactions` | 查询交易流水 |
| `GET`, `POST` | `/api/strategies` | 查询或创建策略版本 |
| `POST` | `/api/redemptions` | 登记实际赎回 |
| `GET`, `POST` | `/api/ai/settings` | 查询或保存本地 AI 模型设置 |
| `POST` | `/api/ai/chat` | 结合当前投资上下文请求模型回答 |

## 市场数据与信号

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/market/latest` | 查询每只基金最近正式净值 |
| `POST` | `/api/jobs/daily-settlement` | 手动同步正式净值、生成快照和日报 |
| `GET` | `/api/reports/daily` | 查询日报；可用 `?accountId=<uuid>` 过滤 |
| `GET` | `/api/signals` | 查询当前信号；可用 `?accountId=<uuid>` 过滤 |
| `PATCH` | `/api/signals` | 将信号标记为已阅读或暂不执行 |
| `GET`, `POST` | `/api/estimates/intraday` | 查询或刷新盘中估算 |
| `POST` | `/api/simulations/redemption` | 按最新正式净值模拟赎回，不写入数据 |

## 导入与备份

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/import/positions` | 下载 Excel 模板；加 `?format=json` 下载 JSON 示例 |
| `POST` | `/api/import/positions` | 以 multipart form 上传 Excel/JSON，字段为 `accountId` 和 `file` |
| `GET` | `/api/backup` | 下载完整 JSON 备份 |
| `POST` | `/api/backup` | 从 JSON 文件恢复数据 |

## 写接口的通用约定

- 成功创建通常返回 `201`。
- 参数校验失败返回 `400`，响应包含 `error: "VALIDATION_ERROR"` 和字段错误。
- 找不到资源返回 `404`；缺少净值等状态冲突通常返回 `409`。
- 金融数值以字符串返回，不要在客户端转成二进制浮点后再回传。
- 重要变更使用事务，并生成 `operation_log`。

## 典型请求

创建账户：

```bash
curl -X POST http://localhost:3000/api/accounts \
  -H 'content-type: application/json' \
  -d '{"name":"我的基金账户"}'
```

刷新正式净值：

```bash
curl -X POST http://localhost:3000/api/jobs/daily-settlement
```

登记赎回时，需要提交账户、基金、交易日期、赎回份额、确认净值和费用；如果平台给出的实际到账金额与“份额 × 净值 - 费用”不同，可显式传入 `proceeds`。完整字段和业务校验以 `lib/validation.ts` 与对应 Route Handler 为准。
