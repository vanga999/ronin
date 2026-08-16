import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { aiSettings } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { getDashboardData } from "@/lib/dashboard";
import { requestChatCompletion, type AiChatMessage } from "@/lib/ai-service";
import { aiChatInput } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 90;

const AI_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

function buildContext() {
  const dashboard = getDashboardData();
  return {
    asOf: dashboard.latestReport?.latestNavDate ?? null,
    summary: dashboard.summary,
    ledger: dashboard.ledger,
    holdings: dashboard.lots.filter((lot) => lot.status === "OPEN").map((lot) => ({
      fundCode: lot.fundCode,
      fundName: lot.fundName,
      purchaseDate: lot.purchaseDate,
      remainingPrincipal: lot.remainingPrincipal,
      remainingShares: lot.remainingShares,
      latestNav: lot.latestNav?.unitNav ?? null,
      navDate: lot.latestNav?.navDate ?? null,
      marketValue: lot.marketValue,
      profitAmount: lot.profitAmount,
      returnRate: lot.returnRate,
    })),
    currentSignals: dashboard.signals.slice(0, 12).map((signal) => ({
      target: signal.fundName ?? "账户总盘",
      signalType: signal.signalType,
      triggerReason: signal.triggerReason,
      suggestedAction: signal.suggestedAction,
      status: signal.status,
    })),
  };
}

function systemPrompt() {
  return `你是“基金智能纪律助手”的分析助手。请使用用户当前本地数据回答问题，重点解释数据、风险和纪律规则，不替用户下达自动交易指令。你不是持牌投资顾问，回答结尾要提醒用户结合基金平台的实际净值、费率和自身风险承受能力确认。\n\n重要口径：正式净值才用于总账和纪律信号；盘中估算只能用于观察方向；不要把不确定信息说成事实。若上下文缺少数据，请直接说明。\n\n当前账户上下文（JSON）：\n${JSON.stringify(buildContext())}`;
}

export async function POST(request: Request) {
  try {
    const input = aiChatInput.parse(await request.json());
    const settings = ensureDatabase().select().from(aiSettings)
      .where(eq(aiSettings.id, AI_SETTINGS_ID)).get();
    if (!settings) {
      return NextResponse.json({ error: "请先在 AI Assist 中保存模型设置" }, { status: 409 });
    }
    if (!settings.apiKey && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/|$)/i.test(settings.baseUrl)) {
      return NextResponse.json({ error: "当前模型地址不是本机地址，请先配置 API Key" }, { status: 409 });
    }
    const messages: AiChatMessage[] = [
      { role: "system", content: systemPrompt() },
      ...input.messages,
    ];
    const content = await requestChatCompletion(settings, messages);
    return NextResponse.json({
      message: { role: "assistant", content },
      providerName: settings.providerName,
      model: settings.model,
      requestId: requestId(request),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
