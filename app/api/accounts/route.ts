import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { accounts } from "@/db/schema";
import { createAuditLog } from "@/db/audit";
import { ensureDefaultStrategy } from "@/lib/default-strategy";
import { accountInput } from "@/lib/validation";
import { errorResponse, requestId } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(ensureDatabase().select().from(accounts).orderBy(desc(accounts.createdAt)).all());
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const input = accountInput.parse(await request.json());
    const created = runInTransaction((tx) => {
      const strategy = ensureDefaultStrategy(tx, reqId);
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        name: input.name,
        strategyId: strategy.id,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(accounts).values(row).run();
      createAuditLog(tx, {
        operationType: "CREATE",
        entityType: "FUND_ACCOUNT",
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
