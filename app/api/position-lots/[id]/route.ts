import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { accounts, instruments, positionLots, transactions } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { generateDailySnapshots } from "@/lib/nav-service";
import { lotInput, normalizeDecimal } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const input = lotInput.parse(await request.json());
    const updated = runInTransaction((tx) => {
      const previous = tx.select().from(positionLots).where(eq(positionLots.id, id)).get();
      if (!previous) return null;
      if (previous.remainingShares !== previous.confirmedShares) {
        throw new Error("该批次已经发生赎回，不能直接修改买入数据；请通过交易记录进行更正");
      }
      if (!tx.select().from(accounts).where(eq(accounts.id, input.accountId)).get()) {
        throw new Error("账户不存在");
      }
      if (!tx.select().from(instruments).where(eq(instruments.id, input.instrumentId)).get()) {
        throw new Error("基金不存在");
      }
      const values = {
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        purchaseDate: input.purchaseDate,
        purchaseAmount: normalizeDecimal(input.purchaseAmount),
        confirmedNav: normalizeDecimal(input.confirmedNav),
        confirmedShares: normalizeDecimal(input.confirmedShares),
        remainingShares: normalizeDecimal(input.confirmedShares),
        remainingPrincipal: normalizeDecimal(input.purchaseAmount),
        purchaseFee: normalizeDecimal(input.purchaseFee),
        updatedAt: new Date().toISOString(),
      };
      tx.update(positionLots).set(values).where(eq(positionLots.id, id)).run();
      tx.update(transactions).set({
        accountId: values.accountId,
        instrumentId: values.instrumentId,
        transactionDate: values.purchaseDate,
        amount: values.purchaseAmount,
        nav: values.confirmedNav,
        shares: values.confirmedShares,
        fee: values.purchaseFee,
        updatedAt: values.updatedAt,
      }).where(eq(transactions.lotId, id)).run();
      createAuditLog(tx, {
        operationType: "UPDATE_WITH_SUBSCRIPTION",
        entityType: "POSITION_LOT",
        entityId: id,
        requestId: reqId,
        detail: { before: previous, after: values },
      });
      return { ...previous, ...values };
    });
    if (!updated) return NextResponse.json({ error: "持仓批次不存在" }, { status: 404 });
    generateDailySnapshots(reqId);
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const deleted = runInTransaction((tx) => {
      const previous = tx.select().from(positionLots).where(eq(positionLots.id, id)).get();
      if (!previous) return null;
      if (previous.remainingShares !== previous.confirmedShares) {
        throw new Error("该批次已经发生赎回，不能删除买入记录");
      }
      tx.delete(transactions).where(eq(transactions.lotId, id)).run();
      tx.delete(positionLots).where(eq(positionLots.id, id)).run();
      createAuditLog(tx, {
        operationType: "DELETE_WITH_SUBSCRIPTION",
        entityType: "POSITION_LOT",
        entityId: id,
        requestId: reqId,
        detail: { deleted: previous },
      });
      return previous;
    });
    if (!deleted) return NextResponse.json({ error: "持仓批次不存在" }, { status: 404 });
    generateDailySnapshots(reqId);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
