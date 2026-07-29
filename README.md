# Fund Intelligence Assistant

基金智能纪律助手：面向个人场外基金投资的本地决策与纪律管理工具。

当前完成：

- 第一阶段：账户、基金、买入批次、交易记录、Excel 导入与操作日志。
- 第二阶段：正式净值同步、历史净值、持仓收益、每日快照和基金日报。
- 第三阶段：成本上限、数据库策略、纪律信号和模拟赎回。

## 本地启动

要求 Node.js 22.13 或更高版本。

```bash
npm install
npm run db:migrate
npm run dev
```

打开 `http://localhost:3000`。默认数据库位于 `data/fund-assistant.db`，可以参考
`.env.example` 修改路径。

## 数据约定

- 金额、净值、份额和策略比例以 SQLite `TEXT` 保存。
- 服务端使用 `decimal.js` 校验和计算，不使用 JavaScript 浮点数处理金融数值。
- API 中所有金融数值均以字符串传输。
- SQLite 自动启用 WAL、外键约束和 5 秒 `busy_timeout`。
- 每笔买入同时生成持仓批次、申购交易与操作日志。
- 账户只保存名称和纪律策略，不配置初始资金或目标利润；投入总额由实际持仓汇总。
- Excel 导入在单个事务中执行，任意一行失败则整批回滚。
- 场外基金使用已公布的正式单位净值计算收益，不把盘中估值当作真实净值。
- 应用运行期间每天 20:00 自动同步；当天未执行时，20:00 后启动会自动补跑。

## Excel 导入

页面可直接下载模板。工作表必须命名为 `fund_position_import`，列为：

```text
基金代码
基金名称
买入日期
买入金额
买入净值
买入份额
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/accounts` | 查询或创建投资账户 |
| GET/POST | `/api/instruments` | 查询或创建基金 |
| GET/POST | `/api/position-lots` | 查询或创建买入批次 |
| GET | `/api/transactions` | 查询交易记录 |
| GET | `/api/import/positions` | 下载 Excel 模板 |
| POST | `/api/import/positions` | 批量导入 Excel 或 JSON 持仓 |
| GET | `/api/market/latest` | 查询每只基金的最新正式净值 |
| POST | `/api/jobs/daily-settlement` | 立即同步净值并生成日报 |
| GET | `/api/reports/daily` | 查询每日资产快照与日报 |
| GET | `/api/signals` | 查询今日账户和基金纪律信号 |
| PATCH | `/api/signals` | 标记信号已阅读或暂不执行 |
| POST | `/api/simulations/redemption` | 按最新正式净值模拟赎回 |
| POST | `/api/redemptions` | 登记实际赎回并分摊成本 |
| GET/POST | `/api/backup` | 下载或恢复完整 JSON 备份 |

## 默认纪律

- 总持仓成本固定上限：`50000`
- 收益达到 `10%`：建议赎回 `50%`
- 收益达到 `18%`：建议赎回剩余仓位
- 亏损达到 `-8%`：暂停继续投入，进入观察
- 亏损达到 `-15%`：触发退出评估
- 未触及风险线且总成本低于上限：允许继续投入，金额和时间由用户决定

所有参数保存在 `fund_strategy`，每条信号同时保存触发原因、指标和完整策略快照。

## 第四阶段：执行与复盘

- 实际赎回按 FIFO 自动分摊批次剩余成本，支持部分及全部赎回。
- 保存费用、到账金额、已实现收益和完整操作日志。
- 信号支持待处理、已阅读、暂不执行、已执行和自动过期。
- 第一止盈执行后跟踪剩余仓位最高净值，达到 5% 回撤时建议退出。
- 完整退出后自动生成持有期、收益、最大回撤和纪律评分复盘。
- 首页展示正式净值快照资产曲线和 5 万元成本额度使用情况。
- 完整 JSON 备份包含账户、基金、净值、持仓、交易、信号、复盘和日志。

## 净值口径

数据适配器位于 `lib/fund-data/`，当前默认使用天天基金的历史净值数据。
所有保存的数据带有来源、抓取时间、净值日期和 `OFFICIAL` 状态。

开放式基金没有交易所意义上的实时净值。页面展示的是最新公布的正式单位净值及其
日增长率，通常在交易日收盘后陆续更新。晚公布、QDII 或非交易日数据会保留真实
净值日期，不会伪装成当天行情。

## 截图识别 JSON

银行截图可以在对话中识别为以下结构，再从页面“文件导入”上传。账户在导入页面选择，
不写入 JSON，方便同一份识别结果导入不同账户。

```json
{
  "version": "1.0",
  "positions": [
    {
      "fundCode": "001513",
      "fundName": "易方达信息产业混合A",
      "purchaseDate": "2026-07-01",
      "purchaseAmount": "20000.00",
      "confirmedNav": "3.2100",
      "confirmedShares": "6230.5296",
      "purchaseFee": "0"
    }
  ]
}
```

所有金融数值必须使用字符串。无法从截图确认的必填字段不会猜测，导入校验失败时整批回滚。

## 修改和删除

- 账户、基金资料和买入批次均可编辑。
- 修改买入批次时，关联的申购交易同步修改。
- 删除买入批次时，关联申购交易同步删除。
- 删除账户或基金会同时删除其关联持仓数据，页面会在执行前二次确认。
- 所有修改和删除均写入 `operation_log`，包含变更前数据。

## 开发命令

```bash
npm run db:generate
npm run db:migrate
npm test
npm run lint
npm run build
```
