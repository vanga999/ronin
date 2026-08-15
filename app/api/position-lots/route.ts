import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { accounts, instruments, positionLots, transactions } from "@/db/schema";
import { createAuditLog } from "@/db/audit";
import { lotInput, normalizeDecimal } from "@/lib/validation";
import { errorResponse, requestId } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const rows = ensureDatabase()
    .select({
      id: positionLots.id,
      accountName: accounts.name,
      fundCode: instruments.code,
      fundName: instruments.name,
      purchaseDate: positionLots.purchaseDate,
      purchaseAmount: positionLots.purchaseAmount,
      confirmedNav: positionLots.confirmedNav,
      confirmedShares: positionLots.confirmedShares,
      remainingShares: positionLots.remainingShares,
      purchaseFee: positionLots.purchaseFee,
      status: positionLots.status,
    })
    .from(positionLots)
    .innerJoin(accounts, eq(positionLots.accountId, accounts.id))
    .innerJoin(instruments, eq(positionLots.instrumentId, instruments.id))
    .orderBy(desc(positionLots.purchaseDate))
    .all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const input = lotInput.parse(await request.json());
    const created = runInTransaction((tx) => {
      const account = tx.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
      const instrument = tx.select().from(instruments).where(eq(instruments.id, input.instrumentId)).get();
      if (!account || !instrument) throw new Error("账户或基金不存在");

      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        purchaseDate: input.purchaseDate,
        purchaseAmount: normalizeDecimal(input.purchaseAmount),
        confirmedNav: normalizeDecimal(input.confirmedNav),
        confirmedShares: normalizeDecimal(input.confirmedShares),
        remainingShares: normalizeDecimal(input.confirmedShares),
        remainingPrincipal: normalizeDecimal(input.purchaseAmount),
        purchaseFee: normalizeDecimal(input.purchaseFee),
        status: "OPEN" as const,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(positionLots).values(row).run();
      tx.insert(transactions).values({
        id: crypto.randomUUID(),
        accountId: row.accountId,
        instrumentId: row.instrumentId,
        lotId: row.id,
        transactionType: "SUBSCRIBE",
        transactionDate: row.purchaseDate,
        amount: row.purchaseAmount,
        nav: row.confirmedNav,
        shares: row.confirmedShares,
        fee: row.purchaseFee,
        createdAt: now,
        updatedAt: now,
      }).run();
      createAuditLog(tx, {
        operationType: "CREATE_WITH_SUBSCRIPTION",
        entityType: "POSITION_LOT",
        entityId: row.id,
        requestId: reqId,
        detail: row,
      });
      return row;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
