import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { fundNavs, instruments, intradayEstimates, positionLots, reviews, signals, strategyStates, transactions } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { generateDailySnapshots } from "@/lib/nav-service";
import { instrumentInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const input = instrumentInput.parse(await request.json());
    const updated = runInTransaction((tx) => {
      const previous = tx.select().from(instruments).where(eq(instruments.id, id)).get();
      if (!previous) return null;
      const values = {
        code: input.code,
        name: input.name,
        fundCompany: input.fundCompany || null,
        fundType: input.fundType || null,
        shareClass: input.shareClass ?? null,
        investmentTheme: input.investmentTheme || null,
        riskLevel: input.riskLevel || null,
        dataSource: input.dataSource || null,
        updatedAt: new Date().toISOString(),
      };
      tx.update(instruments).set(values).where(eq(instruments.id, id)).run();
      createAuditLog(tx, {
        operationType: "UPDATE",
        entityType: "INSTRUMENT",
        entityId: id,
        requestId: reqId,
        detail: { before: previous, after: values },
      });
      return { ...previous, ...values };
    });
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: "基金不存在" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const deleted = runInTransaction((tx) => {
      const previous = tx.select().from(instruments).where(eq(instruments.id, id)).get();
      if (!previous) return null;
      const lots = tx.select({ id: positionLots.id }).from(positionLots)
        .where(eq(positionLots.instrumentId, id)).all();
      tx.delete(reviews).where(eq(reviews.instrumentId, id)).run();
      tx.delete(strategyStates).where(eq(strategyStates.instrumentId, id)).run();
      tx.delete(signals).where(eq(signals.instrumentId, id)).run();
      tx.delete(transactions).where(eq(transactions.instrumentId, id)).run();
      tx.delete(positionLots).where(eq(positionLots.instrumentId, id)).run();
      tx.delete(intradayEstimates).where(eq(intradayEstimates.instrumentId, id)).run();
      tx.delete(fundNavs).where(eq(fundNavs.instrumentId, id)).run();
      tx.delete(instruments).where(eq(instruments.id, id)).run();
      createAuditLog(tx, {
        operationType: "DELETE_WITH_DEPENDENCIES",
        entityType: "INSTRUMENT",
        entityId: id,
        requestId: reqId,
        detail: { deleted: previous, deletedLots: lots.map((lot) => lot.id) },
      });
      return previous;
    });
    if (!deleted) return NextResponse.json({ error: "基金不存在" }, { status: 404 });
    generateDailySnapshots(reqId);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
