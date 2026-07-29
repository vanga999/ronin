import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { instruments } from "@/db/schema";
import { createAuditLog } from "@/db/audit";
import { instrumentInput } from "@/lib/validation";
import { errorResponse, requestId } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(ensureDatabase().select().from(instruments).orderBy(asc(instruments.code)).all());
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const input = instrumentInput.parse(await request.json());
    const created = runInTransaction((tx) => {
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        code: input.code,
        name: input.name,
        instrumentType: "MUTUAL_FUND" as const,
        fundCompany: input.fundCompany || null,
        fundType: input.fundType || null,
        shareClass: input.shareClass ?? null,
        investmentTheme: input.investmentTheme || null,
        riskLevel: input.riskLevel || null,
        dataSource: input.dataSource || null,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(instruments).values(row).run();
      createAuditLog(tx, {
        operationType: "CREATE",
        entityType: "INSTRUMENT",
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
