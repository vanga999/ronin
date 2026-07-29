import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { accounts, dailySnapshots, positionLots, reviews, signals, strategies, strategyStates, transactions } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { accountUpdateInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const input = accountUpdateInput.parse(await request.json());
    const updated = runInTransaction((tx) => {
      const previous = tx.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!previous) return null;
      if (input.strategyId && !tx.select().from(strategies).where(eq(strategies.id, input.strategyId)).get()) {
        throw new Error("选择的规则不存在");
      }
      const values = {
        name: input.name,
        strategyId: input.strategyId ?? previous.strategyId,
        updatedAt: new Date().toISOString(),
      };
      tx.update(accounts).set(values).where(eq(accounts.id, id)).run();
      createAuditLog(tx, {
        operationType: "UPDATE",
        entityType: "FUND_ACCOUNT",
        entityId: id,
        requestId: reqId,
        detail: { before: previous, after: values },
      });
      return { ...previous, ...values };
    });
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: "账户不存在" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reqId = requestId(request);
  try {
    const deleted = runInTransaction((tx) => {
      const previous = tx.select().from(accounts).where(eq(accounts.id, id)).get();
      if (!previous) return null;
      const lots = tx.select({ id: positionLots.id }).from(positionLots)
        .where(eq(positionLots.accountId, id)).all();
      tx.delete(reviews).where(eq(reviews.accountId, id)).run();
      tx.delete(strategyStates).where(eq(strategyStates.accountId, id)).run();
      tx.delete(signals).where(eq(signals.accountId, id)).run();
      tx.delete(dailySnapshots).where(eq(dailySnapshots.accountId, id)).run();
      tx.delete(transactions).where(eq(transactions.accountId, id)).run();
      tx.delete(positionLots).where(eq(positionLots.accountId, id)).run();
      tx.delete(accounts).where(eq(accounts.id, id)).run();
      createAuditLog(tx, {
        operationType: "DELETE_WITH_DEPENDENCIES",
        entityType: "FUND_ACCOUNT",
        entityId: id,
        requestId: reqId,
        detail: { deleted: previous, deletedLots: lots.map((lot) => lot.id) },
      });
      return previous;
    });
    return deleted
      ? NextResponse.json({ deleted: true, id })
      : NextResponse.json({ error: "账户不存在" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
