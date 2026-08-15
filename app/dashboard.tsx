"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { getDashboardData } from "@/lib/dashboard";

type DashboardData = ReturnType<typeof getDashboardData>;
type Panel = "account" | "fund" | "lot" | "redemption" | "import" | "backup" | "manage" | "ruleDetails" | "ruleCreate" | "editAccount" | "editFund" | "editLot" | "simulation" | null;

async function requestJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "保存失败");
  return data;
}

export function Dashboard({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signalPage, setSignalPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{
    accountId: string;
    instrumentId: string;
    navDate: string;
    unitNav: string;
    ratio: string;
    soldShares: string;
    grossProceeds: string;
    allocatedPrincipal: string;
    grossLockedProfit: string;
    remainingShares: string;
    feeNotice: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const { summary, ledger, transactions, accounts, instruments, strategies, lots, latestReport, signals, signalHistory, reviews, history, intradayEstimates } = initialData;
  const returnPercent = (Number(summary.returnRate) * 100).toFixed(2);
  const selectedAccount = accounts.find((item) => item.id === selectedId);
  const selectedFund = instruments.find((item) => item.id === selectedId);
  const selectedLot = lots.find((item) => item.id === selectedId);
  const selectedSignal = signals.find((item) => item.id === selectedId);
  const selectedAvailableShares = selectedSignal?.instrumentId
    ? lots.filter((lot) => lot.instrumentId === selectedSignal.instrumentId && lot.status === "OPEN")
      .reduce((sum, lot) => sum + Number(lot.remainingShares), 0)
    : null;
  const accountSignal = signals.find((item) => item.instrumentId === null);
  const fundSignals = signals.filter((item) => item.instrumentId !== null);
  const activeStrategy = strategies.find((item) => item.id === accounts[0]?.strategyId) ?? strategies[0];
  const signalPageSize = 10;
  const signalPageCount = Math.max(1, Math.ceil(signalHistory.length / signalPageSize));
  const pagedSignalHistory = signalHistory.slice(
    (signalPage - 1) * signalPageSize,
    signalPage * signalPageSize,
  );
  const ledgerPageSize = 10;
  const ledgerPageCount = Math.max(1, Math.ceil(transactions.length / ledgerPageSize));
  const pagedTransactions = transactions.slice(
    (ledgerPage - 1) * ledgerPageSize,
    ledgerPage * ledgerPageSize,
  );
  const intradayFunds = instruments.map((fund) => ({
    fund,
    estimates: intradayEstimates.filter((estimate) => estimate.instrumentId === fund.id),
  })).filter((item) => item.estimates.length > 0);

  function openEditor(nextPanel: Panel, id: string) {
    setSelectedId(id);
    setPanel(nextPanel);
  }

  async function simulateRedemption(instrumentId: string, ratio: string) {
    if (!accounts[0]) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await requestJson("/api/simulations/redemption", "POST", {
        accountId: accounts[0].id,
        instrumentId,
        ratio,
      });
      setSimulation(result);
      setPanel("simulation");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模拟失败");
    } finally {
      setBusy(false);
    }
  }

  async function handle(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      setPanel(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  function formData(event: FormEvent<HTMLFormElement>) {
    return Object.fromEntries(new FormData(event.currentTarget).entries());
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">FI</span>
          <div><strong>基金智能纪律助手</strong><small>Fund Intelligence Assistant</small></div>
        </div>
        <div className="header-actions">
          <span className="phase">第四阶段 · 执行与复盘</span>
          <button className="sync-button" disabled={busy || instruments.length === 0} onClick={() => {
            void handle(() => requestJson("/api/jobs/daily-settlement", "POST", {}), "正式净值、收益与日报已更新");
          }}>{busy ? "同步中…" : "刷新正式净值"}</button>
        </div>
      </header>

      <section className="metrics">
        <article><span>累计投入</span><strong>¥ {summary.investedAmount}</strong><small>来自 {summary.openLotCount} 个开放批次</small></article>
        <article><span>当前市值</span><strong>¥ {summary.marketValue}</strong><small>仅按最新正式净值</small></article>
        <article><span>持有收益</span><strong className={Number(summary.profitAmount) >= 0 ? "profit" : "loss"}>¥ {summary.profitAmount}</strong><small>当前持有收益率 {returnPercent}% · 已实现 ¥{summary.realizedProfit}</small></article>
        <article><span>昨日收益</span><strong className={Number(latestReport?.dailyProfit ?? 0) >= 0 ? "profit" : "loss"}>¥ {latestReport?.dailyProfit ?? "0.00"}</strong><small>{latestReport?.latestNavDate ? `对应 ${latestReport.latestNavDate} 正式净值日` : "同步后生成日报"}</small></article>
      </section>

      <section className="intraday-section">
        <div className="section-heading">
          <div><p className="eyebrow">INTRADAY ESTIMATE</p><h2>今日盘中估算趋势</h2></div>
          <div className="intraday-heading">
            <p>依据最近披露的前十大持仓与股票行情加权估算，仅用于观察方向，不进入总账或纪律信号。</p>
            <button disabled={busy || instruments.length === 0} onClick={() => {
              void handle(() => requestJson("/api/estimates/intraday", "POST", {}), "盘中估算已更新");
            }}>{busy ? "更新中…" : "立即刷新估算"}</button>
          </div>
        </div>
        {intradayFunds.length === 0 ? <div className="signal-empty">交易日盘中刷新后，这里会按每30分钟形成估算趋势</div> : (
          <div className="intraday-grid">{intradayFunds.map(({ fund, estimates }) => {
            const latest = estimates.at(-1)!;
            return <article className="intraday-card" key={fund.id}>
              <div className="intraday-card-head">
                <div><span>{fund.code}</span><h3>{fund.name}</h3></div>
                <strong className={Number(latest.estimatedChangeRate) >= 0 ? "profit" : "loss"}>
                  {(Number(latest.estimatedChangeRate) * 100).toFixed(2)}%
                </strong>
              </div>
              <IntradayTrend estimates={estimates} />
              <dl>
                <div><dt>估算净值</dt><dd>{latest.estimatedNav}</dd></div>
                <div><dt>估算持仓金额</dt><dd>¥ {latest.estimatedMarketValue}</dd></div>
                <div><dt>最新时间</dt><dd>{latest.estimateDate} {latest.estimateTime}</dd></div>
                <div><dt>持仓覆盖率</dt><dd>{(Number(latest.holdingCoverageRate) * 100).toFixed(1)}%</dd></div>
              </dl>
              <small>正式净值基准：{latest.basisNavDate} · 持仓披露：{latest.holdingDisclosureDate ?? "未知"} · ESTIMATED</small>
            </article>;
          })}</div>
        )}
      </section>

      <section className="ledger-section">
        <div className="section-heading">
          <div><p className="eyebrow">INVESTMENT LEDGER</p><h2>投资总账</h2></div>
          <p>累计总盈亏 = 持有盈亏 + 已实现盈亏 + 现金分红。卖出后的盈利或亏损会永久保留在总账中。</p>
        </div>
        <div className="ledger-summary">
          <article><span>累计买入本金</span><strong>¥ {ledger.subscribedPrincipal}</strong></article>
          <article><span>累计赎回到账</span><strong>¥ {ledger.redemptionProceeds}</strong><small>对应卖出成本 ¥ {ledger.redeemedPrincipal}</small></article>
          <article><span>当前持仓市值</span><strong>¥ {ledger.holdingMarketValue}</strong></article>
          <article><span>持有盈亏</span><strong className={Number(ledger.floatingProfit) >= 0 ? "profit" : "loss"}>¥ {ledger.floatingProfit}</strong></article>
          <article><span>已实现盈亏</span><strong className={Number(ledger.realizedProfit) >= 0 ? "profit" : "loss"}>¥ {ledger.realizedProfit}</strong></article>
          <article><span>现金分红</span><strong className={Number(ledger.cashDividends) >= 0 ? "profit" : "loss"}>¥ {ledger.cashDividends}</strong></article>
          <article className="ledger-total"><span>累计总盈亏</span><strong className={Number(ledger.totalProfit) >= 0 ? "profit" : "loss"}>¥ {ledger.totalProfit}</strong><small>相对累计买入 { (Number(ledger.totalReturnRate) * 100).toFixed(2) }% · 累计费用 ¥ {ledger.totalFees}</small></article>
        </div>
        <article className="table-card ledger-transactions">
          <div className="card-title"><h2>交易流水</h2><span>{transactions.length} RECORDS</span></div>
          {transactions.length === 0 ? <Empty text="还没有交易记录" /> : <>
            <div className="table-wrap"><table><thead><tr><th>日期</th><th>基金</th><th>类型</th><th>份额</th><th>交易金额</th><th>实际到账</th><th>已实现盈亏</th><th>费用</th></tr></thead>
              <tbody>{pagedTransactions.map((transaction) => <tr key={transaction.id}>
                <td>{transaction.transactionDate}</td>
                <td><b>{transaction.fundName}</b><small>{transaction.fundCode}</small></td>
                <td>{transactionTypeLabel(transaction.transactionType)}</td>
                <td>{transaction.shares ?? "—"}</td>
                <td>{transaction.amount ? `¥ ${transaction.amount}` : "—"}</td>
                <td>{transaction.proceeds ? `¥ ${transaction.proceeds}` : "—"}</td>
                <td className={Number(transaction.realizedProfit ?? 0) >= 0 ? "profit" : "loss"}>{transaction.realizedProfit ? `¥ ${transaction.realizedProfit}` : "—"}</td>
                <td>¥ {transaction.fee}</td>
              </tr>)}</tbody>
            </table></div>
            {transactions.length > ledgerPageSize && <div className="table-pagination">
              <button disabled={ledgerPage === 1} onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}>上一页</button>
              <span>第 {ledgerPage} / {ledgerPageCount} 页 · 共 {transactions.length} 条</span>
              <button disabled={ledgerPage === ledgerPageCount} onClick={() => setLedgerPage((page) => Math.min(ledgerPageCount, page + 1))}>下一页</button>
            </div>}
          </>}
        </article>
      </section>

      <section className="workspace">
        <div className="section-heading">
          <div><p className="eyebrow">PORTFOLIO DATA</p><h2>资产与净值</h2></div>
          <p>新增持仓后点击“刷新正式净值”。应用运行期间每天 20:00 自动同步，晚公布基金可再次手动刷新。</p>
        </div>
        <div className="actions">
          <button onClick={() => setPanel("account")}><span>01</span><strong>创建账户</strong><small>只需一个便于识别的名称</small></button>
          <button onClick={() => setPanel("fund")}><span>02</span><strong>添加基金</strong><small>维护基金基础资料</small></button>
          <button onClick={() => setPanel("lot")}><span>03</span><strong>记录买入</strong><small>自动生成批次与交易</small></button>
          <button onClick={() => { setSelectedId(null); setPanel("redemption"); }}><span>04</span><strong>记录赎回</strong><small>FIFO 分摊成本与已实现收益</small></button>
          <button onClick={() => setPanel("import")}><span>⇧</span><strong>文件导入</strong><small>支持 Excel 与截图识别 JSON</small></button>
          <button onClick={() => setPanel("backup")}><span>↓</span><strong>备份恢复</strong><small>完整导出或恢复本地数据</small></button>
          <button onClick={() => setPanel("manage")}><span>✎</span><strong>管理数据</strong><small>编辑或删除错误记录</small></button>
        </div>
      </section>

      {message && <div className="message">{message}</div>}

      <section className="signal-section">
        <div className="section-heading">
          <div><p className="eyebrow">TODAY&apos;S DISCIPLINE</p><h2>今日纪律建议</h2></div>
          <p>当前使用：{activeStrategy?.name ?? "尚未配置规则"}。每只基金可单独查看当前位置与各条触发线。</p>
        </div>
        {!accountSignal ? <div className="signal-empty">刷新正式净值后生成今日信号</div> : (
          <div className="signal-grid">
            <article className={`signal-card account-signal ${signalMeta(accountSignal.signalType).tone}`}>
              <span>账户总盘</span>
              <h3>{signalMeta(accountSignal.signalType).label}</h3>
              <p>{accountSignal.suggestedAction}</p>
              <small>{accountSignal.triggerReason}</small>
              <dl>
                <div><dt>当前总成本</dt><dd>¥ {accountSignal.triggerMetrics.investedPrincipal}</dd></div>
                <div><dt>成本上限</dt><dd>¥ {accountSignal.triggerMetrics.maxTotalCost}</dd></div>
                <div><dt>剩余额度</dt><dd>¥ {accountSignal.triggerMetrics.remainingCapacity}</dd></div>
              </dl>
            </article>
            {fundSignals.map((signal) => {
              const meta = signalMeta(signal.signalType);
              return <article className={`signal-card ${meta.tone}`} key={signal.id}>
                <span>{signal.fundCode}</span>
                <h3>{signal.fundName}</h3>
                <b>{meta.label}</b>
                <p>{signal.suggestedAction}</p>
                <small>{signal.triggerReason}</small>
                <div className="signal-rate">{(Number(signal.triggerMetrics.returnRate) * 100).toFixed(2)}%</div>
                <div className="simulation-actions">
                  <button onClick={() => void simulateRedemption(signal.instrumentId!, "0.5")}>
                    <span>模拟赎回</span>
                    <strong>50%</strong>
                  </button>
                  <button onClick={() => void simulateRedemption(signal.instrumentId!, "1")}>
                    <span>模拟赎回</span>
                    <strong>全部份额</strong>
                  </button>
                </div>
                <div className="signal-resolution">
                  <button onClick={() => { setSelectedId(signal.id); setPanel("ruleDetails"); }}>查看触发线</button>
                  <button onClick={() => { setSelectedId(signal.id); setPanel("redemption"); }}>登记实际赎回</button>
                  {signal.status === "ACTIVE" && <>
                    <button onClick={() => void handle(() => requestJson("/api/signals", "PATCH", { id: signal.id, status: "ACKNOWLEDGED" }), "信号已标记为已阅读")}>已阅读</button>
                    <button onClick={() => void handle(() => requestJson("/api/signals", "PATCH", { id: signal.id, status: "DISMISSED", note: "本次暂不执行" }), "已记录本次暂不执行")}>暂不执行</button>
                  </>}
                </div>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="insight-section">
        <div className="section-heading">
          <div><p className="eyebrow">PERFORMANCE &amp; REVIEW</p><h2>资产曲线与投资复盘</h2></div>
          <p>曲线只使用每日正式净值快照；完整退出后自动生成复盘和纪律评分。</p>
        </div>
        <div className="insight-grid">
          <article className="chart-card">
            <div className="card-title"><h2>账户资产曲线</h2><span>{history.length} SNAPSHOTS</span></div>
            <MiniChart values={history.map((item) => Number(item.marketValue))} labels={history.map((item) => item.snapshotDate)} />
          </article>
          <article className="capacity-card">
            <span>总成本额度</span>
            <strong>¥ {summary.investedAmount} <small>/ ¥50,000</small></strong>
            <div><i style={{ width: `${Math.min(100, Number(summary.investedAmount) / 500)}%` }} /></div>
            <p>剩余额度 ¥ {(50000 - Number(summary.investedAmount)).toFixed(2)}</p>
          </article>
        </div>
        <div className="review-grid">
          {reviews.length === 0 ? <div className="signal-empty">完整退出一只基金后，这里会自动生成复盘</div> : reviews.map((review) => (
            <article className="review-card" key={review.id}>
              <span>{review.fundCode}</span><h3>{review.fundName}</h3>
              <strong className={Number(review.realizedProfit) >= 0 ? "profit" : "loss"}>¥ {review.realizedProfit}</strong>
              <dl>
                <div><dt>收益率</dt><dd>{(Number(review.returnRate) * 100).toFixed(2)}%</dd></div>
                <div><dt>持有天数</dt><dd>{review.holdingDays} 天</dd></div>
                <div><dt>最大回撤</dt><dd>{(Number(review.maxDrawdownRate ?? 0) * 100).toFixed(2)}%</dd></div>
                <div><dt>纪律评分</dt><dd>{review.disciplineScore} / 100</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <article className="table-card signal-history">
          <div className="card-title"><h2>纪律信号记录</h2><span>{signalHistory.length} RECENT</span></div>
          <div className="table-wrap"><table><thead><tr><th>日期</th><th>对象</th><th>信号</th><th>触发原因</th><th>处理状态</th></tr></thead>
            <tbody>{pagedSignalHistory.map((signal) => <tr key={signal.id}>
              <td>{signal.signalDate}</td>
              <td>{signal.fundName ?? "账户总盘"}<small>{signal.fundCode ?? "ACCOUNT"}</small></td>
              <td>{signalMeta(signal.signalType).label}</td>
              <td>{signal.triggerReason}</td>
              <td>{signalStatusLabel(signal.status)}{signal.resolutionNote && <small>{signal.resolutionNote}</small>}</td>
            </tr>)}</tbody>
          </table></div>
          {signalHistory.length > signalPageSize && <div className="table-pagination">
            <button disabled={signalPage === 1} onClick={() => setSignalPage((page) => Math.max(1, page - 1))}>上一页</button>
            <span>第 {signalPage} / {signalPageCount} 页 · 共 {signalHistory.length} 条</span>
            <button disabled={signalPage === signalPageCount} onClick={() => setSignalPage((page) => Math.min(signalPageCount, page + 1))}>下一页</button>
          </div>}
        </article>
      </section>

      <section className="data-grid">
        <article className="table-card wide">
          <div className="card-title"><h2>持仓批次</h2><span>{lots.length} RECORDS</span></div>
          {lots.length === 0 ? <Empty text="还没有买入批次" /> : (
            <div className="table-wrap"><table><thead><tr><th>基金</th><th>最新正式净值</th><th>投入金额</th><th>当前市值</th><th>昨日收益</th><th>持有收益</th><th>持有时间 / 效率</th><th>日涨跌幅</th><th>操作</th></tr></thead>
              <tbody>{lots.map((lot) => <tr key={lot.id}><td><b>{lot.fundName}</b><small>{lot.fundCode} · {lot.accountName}</small></td><td>{lot.latestNav?.unitNav ?? "待同步"}<small>{lot.latestNav?.navDate ?? "暂无净值日期"}</small></td><td>¥ {lot.purchaseAmount}</td><td>{lot.marketValue ? `¥ ${lot.marketValue}` : "—"}</td><td className={Number(lot.dailyProfit ?? 0) >= 0 ? "profit" : "loss"}>{lot.dailyProfit ? `¥ ${lot.dailyProfit}` : "—"}<small>{lot.latestNav?.navDate ? `${lot.latestNav.navDate} 净值日` : ""}</small></td><td className={Number(lot.profitAmount ?? 0) >= 0 ? "profit" : "loss"}>{lot.profitAmount ? `¥ ${lot.profitAmount}` : "—"}<small>{lot.returnRate ? `${(Number(lot.returnRate) * 100).toFixed(2)}%` : ""}</small></td><td>{lot.efficiency ? <><b>{lot.efficiency.holdingDays} 天</b><small>日均复合 {(Number(lot.efficiency.dailyCompoundReturnRate ?? 0) * 100).toFixed(3)}%</small><small>{lot.efficiency.annualizedReturnRate ? `年化 ${(Number(lot.efficiency.annualizedReturnRate) * 100).toFixed(2)}%` : "满30天后显示年化"}</small></> : "—"}</td><td className={Number(lot.latestNav?.dailyChangeRate ?? 0) >= 0 ? "profit" : "loss"}>{lot.latestNav?.dailyChangeRate ? `${(Number(lot.latestNav.dailyChangeRate) * 100).toFixed(2)}%` : "—"}</td><td><button className="text-action" onClick={() => openEditor("editLot", lot.id)}>编辑</button><button className="text-action danger" onClick={() => {
                if (window.confirm(`确定删除 ${lot.fundName} 的这笔买入吗？关联申购交易会一并删除。`)) {
                  void handle(() => requestJson(`/api/position-lots/${lot.id}`, "DELETE"), "持仓及关联交易已删除");
                }
              }}>删除</button></td></tr>)}</tbody>
            </table></div>
          )}
          <p className="table-footnote">收益效率按买入日期至最新正式净值日期计算；不足 30 天只显示日均复合收益率，避免短期年化失真。</p>
        </article>
        <article className="table-card">
          <div className="card-title"><h2>每日基金日报</h2><span>OFFICIAL NAV</span></div>
          {!latestReport ? <Empty text="刷新净值后生成首份日报" /> : (
            <div className="daily-report">
              <p>净值数据截至 {latestReport.latestNavDate ?? "暂无正式净值"}</p>
              <small className="report-generated">报告生成日：{latestReport.snapshotDate}{latestReport.hasMixedNavDates ? ` · 各基金净值日期不完全一致（最早 ${latestReport.earliestNavDate}）` : ""}</small>
              <dl>
                <div><dt>当前资产</dt><dd>¥ {latestReport.marketValue}</dd></div>
                <div><dt>持有收益</dt><dd className={Number(latestReport.profitAmount) >= 0 ? "profit" : "loss"}>¥ {latestReport.profitAmount}</dd></div>
                <div><dt>收益率</dt><dd>{(Number(latestReport.returnRate) * 100).toFixed(2)}%</dd></div>
                <div><dt>昨日收益</dt><dd className={Number(latestReport.dailyProfit) >= 0 ? "profit" : "loss"}>¥ {latestReport.dailyProfit}</dd></div>
              </dl>
              {latestReport.staleFundCount > 0 && <small className="warning">有 {latestReport.staleFundCount} 只基金缺少正式净值，未计入市值。</small>}
              <small>纪律信号使用同一份正式净值生成。</small>
            </div>
          )}
        </article>
      </section>

      {panel && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}>
        <div className="modal">
          <button className="close" onClick={() => setPanel(null)} aria-label="关闭">×</button>
          {panel === "account" && <Form title="创建投资账户" submit={busy ? "保存中…" : "创建账户"} disabled={busy} onSubmit={(e) => {
            const data = formData(e); void handle(() => requestJson("/api/accounts", "POST", data), "账户已创建");
          }}>
            <Field label="账户名称" name="name" placeholder="科技基金账户" />
            <p className="form-note">账户不设预算上限。累计投入由实际买入记录自动汇总。</p>
          </Form>}
          {panel === "fund" && <Form title="添加关注基金" submit={busy ? "保存中…" : "添加基金"} disabled={busy} onSubmit={(e) => {
            const data = formData(e); void handle(() => requestJson("/api/instruments", "POST", data), "基金已添加");
          }}>
            <Field label="基金代码" name="code" placeholder="001513" />
            <Field label="基金名称" name="name" placeholder="易方达信息产业混合A" />
            <div className="field"><label>份额类别</label><select name="shareClass" defaultValue="A"><option>A</option><option>C</option><option value="OTHER">其他</option></select></div>
            <Field label="基金公司（选填）" name="fundCompany" placeholder="易方达基金" required={false} />
            <Field label="投资主题（选填）" name="investmentTheme" placeholder="科技" required={false} />
          </Form>}
          {panel === "lot" && <Form title="记录一笔买入" submit={busy ? "保存中…" : "保存买入"} disabled={busy || !accounts.length || !instruments.length} onSubmit={(e) => {
            const data = formData(e); void handle(() => requestJson("/api/position-lots", "POST", data), "买入批次与交易已保存");
          }}>
            {!accounts.length || !instruments.length ? <p className="form-note">请先创建账户并添加基金。</p> : <>
              <Select label="投资账户" name="accountId" options={accounts.map((x) => ({ value: x.id, label: x.name }))} />
              <Select label="基金" name="instrumentId" options={instruments.map((x) => ({ value: x.id, label: `${x.code} ${x.name}` }))} />
              <Field label="买入日期" name="purchaseDate" type="date" />
              <Field label="买入金额" name="purchaseAmount" placeholder="20000.00" />
              <Field label="确认净值" name="confirmedNav" placeholder="3.2100" />
              <Field label="确认份额" name="confirmedShares" placeholder="6230.5296" />
              <Field label="申购费用" name="purchaseFee" placeholder="0" required={false} />
            </>}
          </Form>}
          {panel === "redemption" && <Form title="登记实际赎回" submit={busy ? "保存中…" : "确认登记赎回"} disabled={busy || !accounts.length || !instruments.length} onSubmit={(e) => {
            const data = formData(e);
            if (selectedSignal) data.signalId = selectedSignal.id;
            void handle(() => requestJson("/api/redemptions", "POST", data), "赎回、成本分摊与已实现收益已保存");
          }}>
            <p className="form-note">这是实际交易记录。系统按最早买入批次优先（FIFO）分摊剩余成本；到账金额留空时按“份额 × 净值 − 费用”计算。</p>
            <Select label="投资账户" name="accountId" defaultValue={selectedSignal?.accountId ?? accounts[0]?.id} options={accounts.map((x) => ({ value: x.id, label: x.name }))} />
            <Select label="基金" name="instrumentId" defaultValue={selectedSignal?.instrumentId ?? undefined} options={instruments.map((x) => ({ value: x.id, label: `${x.code} ${x.name}` }))} />
            <Field label="赎回日期" name="transactionDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <Field label="确认赎回份额" name="shares" placeholder={selectedAvailableShares ? selectedAvailableShares.toFixed(4) : "500.0000"} />
            <Field label="确认净值" name="confirmedNav" placeholder={selectedSignal?.triggerMetrics ? String(selectedSignal.triggerMetrics.unitNav ?? "") : "1.2345"} />
            <Field label="赎回费用" name="fee" placeholder="0" required={false} />
            <Field label="实际到账金额（选填）" name="proceeds" placeholder="留空自动计算" required={false} />
            <Field label="备注（选填）" name="note" placeholder="银行 APP 确认信息" required={false} />
          </Form>}
          {panel === "import" && <Form title="Excel / JSON 批量导入" submit={busy ? "导入中…" : "开始导入"} disabled={busy || !accounts.length} encType="multipart/form-data" onSubmit={(e) => {
            const data = new FormData(e.currentTarget);
            void handle(async () => {
              const response = await fetch("/api/import/positions", { method: "POST", body: data });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error ?? "导入失败");
              return result;
            }, "Excel 数据已完整导入");
          }}>
            {!accounts.length ? <p className="form-note">请先创建一个投资账户。</p> : <>
              <Select label="导入到" name="accountId" options={accounts.map((x) => ({ value: x.id, label: x.name }))} />
              <div className="field"><label>Excel 或 JSON 文件</label><input ref={fileRef} name="file" type="file" accept=".xlsx,.xls,.json,application/json" required /></div>
              <div className="template-links"><a className="template-link" href="/api/import/positions">Excel 模板 ↗</a><a className="template-link" href="/api/import/positions?format=json">截图识别 JSON 模板 ↗</a></div>
              <p className="form-note">以后把银行截图发给我，我会按 JSON 模板生成文件。任何一条错误都会整批回滚，不会导入一半。</p>
            </>}
          </Form>}
          {panel === "backup" && <div className="backup-panel">
            <p className="eyebrow">LOCAL BACKUP</p><h2>完整备份与恢复</h2>
            <p className="form-note">备份包含账户、基金、净值、持仓、交易、信号、复盘和操作日志。恢复会用备份内容替换当前本地数据。</p>
            <a className="backup-download" href="/api/backup">下载完整 JSON 备份</a>
            <div className="field"><label>选择备份文件</label><input ref={backupRef} type="file" accept=".json,application/json" /></div>
            <button className="submit" disabled={busy} onClick={() => {
              const file = backupRef.current?.files?.[0];
              if (!file || !window.confirm("恢复会替换当前全部数据。确认继续吗？")) return;
              void handle(async () => {
                const response = await fetch("/api/backup", { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error ?? "恢复失败");
                return result;
              }, "备份已恢复");
            }}>恢复此备份</button>
          </div>}
          {panel === "manage" && <div className="manage-panel">
            <p className="eyebrow">DATA MANAGEMENT</p><h2>管理基础资料</h2>
            <h3>投资账户</h3>
            <ul>{accounts.map((item) => <li key={item.id}><div><b>{item.name}</b><small>投入金额按实际持仓动态汇总</small></div><div><button onClick={() => openEditor("editAccount", item.id)}>编辑</button><button className="danger" onClick={() => {
              if (window.confirm(`确定删除账户“${item.name}”吗？账户下的持仓、交易和日报也会删除。`)) {
                void handle(() => requestJson(`/api/accounts/${item.id}`, "DELETE"), "账户及关联数据已删除");
              }
            }}>删除</button></div></li>)}</ul>
            <h3>基金资料</h3>
            <ul>{instruments.map((item) => <li key={item.id}><div><b>{item.name}</b><small>{item.code} · {item.shareClass ?? "未分类"}</small></div><div><button onClick={() => openEditor("editFund", item.id)}>编辑</button><button className="danger" onClick={() => {
              if (window.confirm(`确定删除基金“${item.name}”吗？对应持仓、交易和净值记录也会删除。`)) {
                void handle(() => requestJson(`/api/instruments/${item.id}`, "DELETE"), "基金及关联数据已删除");
              }
            }}>删除</button></div></li>)}</ul>
            <h3>纪律规则</h3>
            <ul>{strategies.map((strategy) => <li key={strategy.id}><div><b>{strategy.name}</b><small>止盈 {(Number(strategy.firstTakeProfitRate) * 100).toFixed(0)}% / {(Number(strategy.secondTakeProfitRate) * 100).toFixed(0)}% · 风险 {(Number(strategy.warningLossRate) * 100).toFixed(0)}%</small></div><div><span className="rule-version-badge">已锁定</span></div></li>)}</ul>
            <h3>账户使用规则</h3>
            {accounts.map((account) => <div className="rule-selector" key={account.id}>
              <div><b>{account.name}</b><small>切换后下一次刷新净值按新规则生成信号</small></div>
              <select value={account.strategyId ?? ""} onChange={(event) => {
                void handle(() => requestJson(`/api/accounts/${account.id}`, "PATCH", {
                  name: account.name,
                  strategyId: event.target.value,
                }), "账户规则已切换");
              }}>{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</select>
            </div>)}
            <button className="submit" onClick={() => setPanel("ruleCreate")}>创建新的规则版本</button>
          </div>}
          {panel === "ruleDetails" && activeStrategy && selectedSignal && <div className="rules-panel">
            <p className="eyebrow">DISCIPLINE THRESHOLDS</p><h2>{selectedSignal.fundName} · 触发线</h2>
            <div className="active-rule"><span>当前规则</span><strong>{activeStrategy.name}</strong></div>
            <RuleThresholds strategy={activeStrategy} signals={[selectedSignal]} />
          </div>}
          {panel === "ruleCreate" && <Form title="创建新的规则版本" submit={busy ? "保存中…" : "保存新规则"} disabled={busy} onSubmit={(e) => {
            const data = formData(e);
            for (const key of ["firstTakeProfitRate", "firstTakeProfitRatio", "secondTakeProfitRate", "drawdownTakeProfitRate", "warningLossRate", "exitReviewLossRate"]) {
              data[key] = String(Number(data[key]) / 100);
            }
            void handle(() => requestJson("/api/strategies", "POST", data), "新规则已保存，可在规则管理中选择");
          }}>
            <Field label="规则名称" name="name" defaultValue={`规则 ${String.fromCharCode(65 + strategies.length)} · 自定义纪律`} />
            <Field label="第一止盈线（%）" name="firstTakeProfitRate" defaultValue="10" />
            <Field label="第一次赎回比例（%）" name="firstTakeProfitRatio" defaultValue="50" />
            <Field label="第二止盈线（%）" name="secondTakeProfitRate" defaultValue="18" />
            <Field label="第一止盈后回撤退出（%）" name="drawdownTakeProfitRate" defaultValue="5" />
            <Field label="暂停投入观察线（%）" name="warningLossRate" defaultValue="-8" />
            <Field label="退出评估线（%）" name="exitReviewLossRate" defaultValue="-15" />
            <Field label="账户总成本上限（元）" name="maxTotalCost" defaultValue="50000" />
            <p className="form-note">当前设计不设置自动补仓线。高于风险观察线且未超过总成本上限时，只表示“允许投入”，实际是否投入和金额仍由你决定。</p>
          </Form>}
          {panel === "editAccount" && selectedAccount && <Form title="编辑投资账户" submit={busy ? "保存中…" : "保存修改"} disabled={busy} onSubmit={(e) => {
            void handle(() => requestJson(`/api/accounts/${selectedAccount.id}`, "PATCH", formData(e)), "账户已更新");
          }}>
            <Field label="账户名称" name="name" defaultValue={selectedAccount.name} />
            <Select label="使用的纪律规则" name="strategyId" defaultValue={selectedAccount.strategyId ?? undefined} options={strategies.map((x) => ({ value: x.id, label: x.name }))} />
            <p className="form-note">资金规模由你的真实买入记录决定，无需预先配置。</p>
          </Form>}
          {panel === "editFund" && selectedFund && <Form title="编辑基金资料" submit={busy ? "保存中…" : "保存修改"} disabled={busy} onSubmit={(e) => {
            void handle(() => requestJson(`/api/instruments/${selectedFund.id}`, "PATCH", formData(e)), "基金资料已更新");
          }}>
            <Field label="基金代码" name="code" defaultValue={selectedFund.code} />
            <Field label="基金名称" name="name" defaultValue={selectedFund.name} />
            <div className="field"><label>份额类别</label><select name="shareClass" defaultValue={selectedFund.shareClass ?? "OTHER"}><option>A</option><option>C</option><option value="OTHER">其他</option></select></div>
            <Field label="基金公司（选填）" name="fundCompany" defaultValue={selectedFund.fundCompany ?? ""} required={false} />
            <Field label="投资主题（选填）" name="investmentTheme" defaultValue={selectedFund.investmentTheme ?? ""} required={false} />
          </Form>}
          {panel === "editLot" && selectedLot && <Form title="编辑买入记录" submit={busy ? "保存中…" : "保存修改"} disabled={busy} onSubmit={(e) => {
            void handle(() => requestJson(`/api/position-lots/${selectedLot.id}`, "PATCH", formData(e)), "持仓与关联交易已更新");
          }}>
            <Select label="投资账户" name="accountId" defaultValue={selectedLot.accountId} options={accounts.map((x) => ({ value: x.id, label: x.name }))} />
            <Select label="基金" name="instrumentId" defaultValue={selectedLot.instrumentId} options={instruments.map((x) => ({ value: x.id, label: `${x.code} ${x.name}` }))} />
            <Field label="买入日期" name="purchaseDate" type="date" defaultValue={selectedLot.purchaseDate} />
            <Field label="买入金额" name="purchaseAmount" defaultValue={selectedLot.purchaseAmount} />
            <Field label="确认净值" name="confirmedNav" defaultValue={selectedLot.confirmedNav} />
            <Field label="确认份额" name="confirmedShares" defaultValue={selectedLot.confirmedShares} />
            <Field label="申购费用" name="purchaseFee" defaultValue={selectedLot.purchaseFee} required={false} />
          </Form>}
          {panel === "simulation" && simulation && <div className="simulation-panel">
            <p className="eyebrow">REDEMPTION SIMULATION</p>
            <h2>模拟赎回 {(Number(simulation.ratio) * 100).toFixed(0)}%</h2>
            <p className="form-note">按 {simulation.navDate} 正式净值 {simulation.unitNav} 模拟，不会产生真实交易。</p>
            <dl>
              <div><dt>卖出份额</dt><dd>{simulation.soldShares}</dd></div>
              <div><dt>预计赎回总额</dt><dd>¥ {simulation.grossProceeds}</dd></div>
              <div><dt>对应投入成本</dt><dd>¥ {simulation.allocatedPrincipal}</dd></div>
              <div><dt>锁定账面利润</dt><dd className={Number(simulation.grossLockedProfit) >= 0 ? "profit" : "loss"}>¥ {simulation.grossLockedProfit}</dd></div>
              <div><dt>剩余份额</dt><dd>{simulation.remainingShares}</dd></div>
            </dl>
            <small>{simulation.feeNotice}</small>
          </div>}
        </div>
      </div>}
      <footer className="site-footer">
        <p>投资不是猜涨跌，而是执行纪律。先把每一笔投入算清楚。</p>
        <small>系统使用正式单位净值与 Decimal 精确计算；净值日期透明展示，不把盘中估算当作真实收益。</small>
      </footer>
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty"><span>—</span><p>{text}</p></div>;
}

function MiniChart({ values, labels }: { values: number[]; labels: string[] }) {
  if (values.length === 0) return <Empty text="每日结算后开始积累资产曲线" />;
  const width = 720;
  const height = 260;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const left = 76;
  const right = 24;
  const top = 24;
  const bottom = 62;
  const plotHeight = height - top - bottom;
  const ticks = max === min
    ? [max]
    : [max, min + range / 2, min];
  const points = values.map((value, index) => {
    const x = values.length === 1 ? (left + width - right) / 2 : left + index * ((width - left - right) / (values.length - 1));
    const y = values.length === 1 ? top + plotHeight / 2 : top + ((max - value) / range) * plotHeight;
    return { x, y, value, label: labels[index] };
  });
  return <div className="mini-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="账户资产曲线">
      {ticks.map((tick) => {
        const y = max === min ? top + plotHeight / 2 : top + ((max - tick) / range) * plotHeight;
        return <g key={tick}>
          <line className="chart-grid-line" x1={left} y1={y} x2={width - right} y2={y} />
          <text className="chart-axis-label" x={left - 10} y={y + 4} textAnchor="end">¥{formatChartAmount(tick)}</text>
        </g>;
      })}
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
      {points.map((point, index) => <g className="chart-point" key={`${point.label}-${index}`}>
        <circle cx={point.x} cy={point.y} r="5" />
        <text className="chart-hover-value" x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle">¥{point.value.toFixed(2)}</text>
        <text className="chart-date-label" x={point.x} y={height - bottom + 20} textAnchor="end" transform={`rotate(-40 ${point.x} ${height - bottom + 20})`}>{point.label.slice(5)}</text>
      </g>)}
    </svg>
    <div><span>{labels[0]}</span><strong>¥ {values.at(-1)?.toFixed(2)}</strong><span>{labels.at(-1)}</span></div>
  </div>;
}

function IntradayTrend({ estimates }: { estimates: DashboardData["intradayEstimates"] }) {
  const width = 440;
  const height = 130;
  const values = estimates.map((item) => Number(item.estimatedChangeRate) * 100);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const points = estimates.map((estimate, index) => ({
    x: estimates.length === 1 ? width / 2 : 18 + index * ((width - 36) / (estimates.length - 1)),
    y: 14 + ((max - values[index]) / range) * 82,
    value: values[index],
    time: estimate.estimateTime,
  }));
  const zeroY = 14 + ((max - 0) / range) * 82;
  return <svg className="intraday-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="盘中估算涨跌趋势">
    <line x1="18" y1={zeroY} x2={width - 18} y2={zeroY} />
    <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} />
    {points.map((point) => <g className="intraday-point" key={point.time}>
      <circle cx={point.x} cy={point.y} r="4" />
      <text className="intraday-hover" x={point.x} y={Math.max(10, point.y - 10)} textAnchor="middle">{point.value.toFixed(2)}%</text>
      <text className="intraday-time" x={point.x} y="118" textAnchor="middle">{point.time}</text>
    </g>)}
  </svg>;
}

function formatChartAmount(value: number) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function RuleThresholds({
  strategy,
  signals,
}: {
  strategy: DashboardData["strategies"][number];
  signals: DashboardData["signals"];
}) {
  const percent = (value: string) => `${(Number(value) * 100).toFixed(0)}%`;
  return <div className="rule-thresholds">
    <div className="threshold-list">
      <div className="danger-zone"><strong>{percent(strategy.exitReviewLossRate)}</strong><span>退出评估</span><small>停止追加，评估是否全部退出</small></div>
      <div className="watch-zone"><strong>{percent(strategy.warningLossRate)}</strong><span>暂停投入</span><small>进入风险观察，不机械补仓</small></div>
      <div className="allow-zone"><strong>&gt; {percent(strategy.warningLossRate)}</strong><span>允许投入</span><small>同时要求账户总成本低于 ¥{strategy.maxTotalCost}</small></div>
      <div className="profit-zone"><strong>{percent(strategy.firstTakeProfitRate)}</strong><span>第一止盈</span><small>建议赎回 {percent(strategy.firstTakeProfitRatio)}</small></div>
      <div className="profit-zone"><strong>{percent(strategy.secondTakeProfitRate)}</strong><span>第二止盈</span><small>建议赎回剩余仓位</small></div>
      <div className="drawdown-zone"><strong>{percent(strategy.drawdownTakeProfitRate)}</strong><span>回撤止盈</span><small>第一止盈执行后，从最高净值回撤到此幅度退出</small></div>
    </div>
    <div className="fund-scales">
      {signals.map((signal) => {
        const rate = Number(signal.triggerMetrics.returnRate) * 100;
        const marker = Math.max(0, Math.min(100, ((rate + 20) / 40) * 100));
        return <div className="fund-scale" key={signal.id}>
          <div><b>{signal.fundName}</b><strong className={rate >= 0 ? "profit" : "loss"}>{rate.toFixed(2)}%</strong></div>
          <div className="scale-track">
            <i className="line-exit" style={{ left: `${((Number(strategy.exitReviewLossRate) * 100 + 20) / 40) * 100}%` }} />
            <i className="line-warning" style={{ left: `${((Number(strategy.warningLossRate) * 100 + 20) / 40) * 100}%` }} />
            <i className="line-first" style={{ left: `${((Number(strategy.firstTakeProfitRate) * 100 + 20) / 40) * 100}%` }} />
            <i className="line-second" style={{ left: `${((Number(strategy.secondTakeProfitRate) * 100 + 20) / 40) * 100}%` }} />
            <em style={{ left: `${marker}%` }} />
          </div>
          <div className="scale-labels"><span>-20%</span><span>0%</span><span>+20%</span></div>
          <small>{distanceToNextRule(rate, strategy)}</small>
        </div>;
      })}
    </div>
    <p className="no-average-down"><strong>补仓规则：</strong>没有“跌到某个百分比必须补仓”的条件。收益率高于风险观察线、账户无其他风险警告且总成本未到上限时，系统只显示“允许投入”。</p>
  </div>;
}

function distanceToNextRule(rate: number, strategy: DashboardData["strategies"][number]) {
  const exit = Number(strategy.exitReviewLossRate) * 100;
  const warning = Number(strategy.warningLossRate) * 100;
  const first = Number(strategy.firstTakeProfitRate) * 100;
  const second = Number(strategy.secondTakeProfitRate) * 100;
  if (rate <= exit) return `已越过退出评估线 ${exit.toFixed(0)}%`;
  if (rate <= warning) return `距离退出评估线还有 ${(rate - exit).toFixed(2)} 个百分点`;
  if (rate < first) return `距离第一止盈线还有 ${(first - rate).toFixed(2)} 个百分点`;
  if (rate < second) return `已触发第一止盈，距离第二止盈还有 ${(second - rate).toFixed(2)} 个百分点`;
  return `已达到第二止盈线 ${second.toFixed(0)}%`;
}

function Field({ label, name, placeholder, type = "text", required = true, defaultValue }: { label: string; name: string; placeholder?: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><input id={name} name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} /></div>;
}

function Select({ label, name, options, defaultValue }: { label: string; name: string; options: { value: string; label: string }[]; defaultValue?: string }) {
  return <div className="field"><label htmlFor={name}>{label}</label><select id={name} name={name} defaultValue={defaultValue}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function Form({ title, submit, disabled, children, onSubmit, encType }: { title: string; submit: string; disabled: boolean; children: React.ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; encType?: string }) {
  return <form encType={encType} onSubmit={(event) => { event.preventDefault(); onSubmit(event); }}><p className="eyebrow">DATA ENTRY</p><h2>{title}</h2><div className="form-fields">{children}</div><button className="submit" type="submit" disabled={disabled}>{submit}</button></form>;
}

function signalMeta(type: string) {
  const map: Record<string, { label: string; tone: string }> = {
    ALLOW_BUY: { label: "允许继续投入", tone: "signal-ok" },
    PAUSE_BUY: { label: "暂停投入", tone: "signal-watch" },
    HOLD: { label: "继续持有", tone: "signal-neutral" },
    TAKE_PROFIT_HALF: { label: "止盈50%", tone: "signal-profit" },
    TAKE_PROFIT_ALL: { label: "全部止盈", tone: "signal-profit" },
    EXIT_REVIEW: { label: "退出评估", tone: "signal-danger" },
  };
  return map[type] ?? { label: type, tone: "signal-neutral" };
}

function signalStatusLabel(status: string) {
  return {
    ACTIVE: "待处理",
    ACKNOWLEDGED: "已阅读",
    EXECUTED: "已执行",
    DISMISSED: "暂不执行",
    EXPIRED: "已过期",
  }[status] ?? status;
}

function transactionTypeLabel(type: string) {
  return {
    SUBSCRIBE: "买入",
    REDEEM: "赎回",
    DIVIDEND: "现金分红",
    REINVEST: "红利再投资",
    ADJUSTMENT: "调整",
  }[type] ?? type;
}
