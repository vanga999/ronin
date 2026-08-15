import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase, runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { strategies } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { normalizeDecimal, strategyInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    ensureDatabase().select().from(strategies).orderBy(desc(strategies.createdAt)).all(),
  );
}

export async function POST(request: Request) {
  try {
    const input = strategyInput.parse(await request.json());
    const reqId = requestId(request);
    const row = runInTransaction((tx) => {
      const now = new Date().toISOString();
      const created = {
        id: crypto.randomUUID(),
        name: input.name,
        firstTakeProfitRate: normalizeDecimal(input.firstTakeProfitRate),
        firstTakeProfitRatio: normalizeDecimal(input.firstTakeProfitRatio),
        secondTakeProfitRate: normalizeDecimal(input.secondTakeProfitRate),
        drawdownTakeProfitRate: normalizeDecimal(input.drawdownTakeProfitRate),
        warningLossRate: normalizeDecimal(input.warningLossRate),
        exitReviewLossRate: normalizeDecimal(input.exitReviewLossRate),
        maxTotalCost: normalizeDecimal(input.maxTotalCost),
        locked: true,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(strategies).values(created).run();
      createAuditLog(tx, {
        operationType: "CREATE_RULE_VERSION",
        entityType: "FUND_STRATEGY",
        entityId: created.id,
        requestId: reqId,
        detail: created,
      });
      return created;
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
