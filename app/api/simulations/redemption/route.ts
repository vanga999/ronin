import Decimal from "decimal.js";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { fundNavs, positionLots } from "@/db/schema";
import { errorResponse } from "@/lib/http";
import { positiveDecimalString } from "@/lib/validation";
import { z } from "zod";

export const runtime = "nodejs";

const inputSchema = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  ratio: positiveDecimalString.refine((value) => new Decimal(value).lessThanOrEqualTo(1), "卖出比例不能超过100%"),
});

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    const database = ensureDatabase();
    const lots = database.select().from(positionLots).where(and(
      eq(positionLots.accountId, input.accountId),
      eq(positionLots.instrumentId, input.instrumentId),
      eq(positionLots.status, "OPEN"),
    )).all();
    if (!lots.length) return NextResponse.json({ error: "没有可模拟的开放持仓" }, { status: 404 });
    const latest = database.select().from(fundNavs)
      .where(eq(fundNavs.instrumentId, input.instrumentId))
      .orderBy(desc(fundNavs.navDate))
      .limit(1).get();
    if (!latest) return NextResponse.json({ error: "缺少正式净值，无法模拟" }, { status: 409 });

    const ratio = new Decimal(input.ratio);
    const totalShares = lots.reduce((sum, lot) => sum.plus(lot.remainingShares), new Decimal(0));
    const principal = lots.reduce((sum, lot) => sum.plus(lot.remainingPrincipal), new Decimal(0));
    const soldShares = totalShares.mul(ratio);
    const grossProceeds = soldShares.mul(latest.unitNav);
    const allocatedPrincipal = principal.mul(ratio);
    return NextResponse.json({
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      navDate: latest.navDate,
      unitNav: latest.unitNav,
      ratio: ratio.toFixed(4),
      soldShares: soldShares.toFixed(4),
      grossProceeds: grossProceeds.toFixed(2),
      allocatedPrincipal: allocatedPrincipal.toFixed(2),
      grossLockedProfit: grossProceeds.minus(allocatedPrincipal).toFixed(2),
      remainingShares: totalShares.minus(soldShares).toFixed(4),
      estimatedFee: null,
      estimatedNetProceeds: null,
      feeNotice: "赎回费取决于基金费率和每批持有天数，请以银行确认页面为准",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
