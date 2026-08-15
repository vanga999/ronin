import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { ensureDatabase } from "@/db";
import { accounts, instruments, transactions } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = ensureDatabase()
    .select({
      id: transactions.id,
      accountName: accounts.name,
      fundCode: instruments.code,
      fundName: instruments.name,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      amount: transactions.amount,
      nav: transactions.nav,
      shares: transactions.shares,
      fee: transactions.fee,
      proceeds: transactions.proceeds,
      realizedProfit: transactions.realizedProfit,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .orderBy(desc(transactions.transactionDate))
    .all();
  return NextResponse.json(rows);
}
