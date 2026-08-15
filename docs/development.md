# 本地开发

## 环境准备

```bash
npm install
cp .env.example .env.local
npm run db:migrate
```

开发服务器：

```bash
npm run dev
```

## 质量检查

提交前建议按以下顺序执行：

```bash
npm test
npm run lint
npm run build
```

测试覆盖策略判断、金额计算、FIFO 赎回、导入校验、净值 provider 和基础验证。涉及金融计算或数据迁移的变更，应同时补充边界测试。

## 修改数据库 schema

1. 修改 `db/schema.ts`。
2. 运行 `npm run db:generate`。
3. 检查新生成的 `drizzle/*.sql`，确认没有误删或不必要的数据变更。
4. 在新的临时数据库上执行 `npm run db:migrate`。
5. 运行测试、lint 和 build。

不要手工修改已经应用到用户数据库的历史迁移；需要新的变更就生成新的迁移文件。

## 增加 API

推荐流程：

1. 在 `app/api/<resource>/route.ts` 或动态子路径中添加 handler。
2. 在 `lib/validation.ts` 定义输入 schema。
3. 对状态变更使用 `runInTransaction()`。
4. 对金融数值使用 `Decimal`，并保持字符串输入输出。
5. 为关键写入增加 `createAuditLog()`。
6. 为 API 和业务逻辑补充测试，并更新 [API 参考](api.md)。

## 增加基金数据源

实现 `FundDataProvider`，保证超时、响应校验、来源标记和真实净值日期，然后在 `lib/fund-data/index.ts` 中注入。不要让外部 provider 的字段格式直接泄漏到数据库层。

## 本地数据卫生

`data/*.db`、导入草稿、`.env*` 和构建产物已被忽略。不要把真实账户名、基金持仓、备份文件、API 响应或截图提交到仓库；测试应使用合成数据。
