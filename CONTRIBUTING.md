# 贡献指南

感谢关注 Fund Intelligence Assistant。项目目前优先保证计算口径、数据可追溯和本地部署稳定性。

## 提交前

请确认：

- 变更范围与 issue 或讨论一致。
- 新增或修改了金融计算、校验、迁移时，补充对应测试。
- `npm test`、`npm run lint` 和 `npm run build` 通过。
- 没有提交 `.env`、SQLite 数据库、备份、真实持仓或个人信息。
- 如果 API、导入格式、数据口径发生变化，已同步更新 `README.md` 或 `docs/`。

## Commit 与 Pull Request

Commit 标题请用简短动词开头，例如：

```text
fix: correct FIFO principal allocation
docs: explain official NAV semantics
test: cover partial redemption rounding
```

Pull Request 描述请说明：

1. 解决了什么问题。
2. 采用了什么数据或计算口径。
3. 是否涉及数据库迁移或破坏性行为。
4. 如何验证，是否有已知限制。

涉及 UI 的改动请附截图；涉及外部数据的改动请说明来源和失败处理。

## 讨论优先的变更

新增自动交易、引入认证/多用户、改变收益或 FIFO 定义、替换默认策略、增加新的外部数据源，建议先开 issue 讨论设计和风险，再提交实现。
