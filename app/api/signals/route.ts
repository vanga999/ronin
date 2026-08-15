import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ensureDatabase } from "@/db";
import { createAuditLog } from "@/db/audit";
import { signals } from "@/db/schema";
import { errorResponse, requestId } from "@/lib/http";
import { getCurrentSignals } from "@/lib/strategy-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("accountId");
    const accountId = value ? z.string().uuid().parse(value) : undefined;
    return NextResponse.json(getCurrentSignals(accountId));
  } catch (error) {
    return errorResponse(error);
  }
}

const resolutionInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["ACKNOWLEDGED", "DISMISSED"]),
  note: z.string().trim().max(300).optional().default(""),
});

export async function PATCH(request: Request) {
  try {
    const input = resolutionInput.parse(await request.json());
    const database = ensureDatabase();
    const existing = database.select().from(signals).where(eq(signals.id, input.id)).get();
    if (!existing) return NextResponse.json({ error: "信号不存在" }, { status: 404 });
    const now = new Date().toISOString();
    database.update(signals).set({
      status: input.status,
      resolutionNote: input.note,
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(signals.id, input.id)).run();
    createAuditLog(database, {
      operationType: "RESOLVE_SIGNAL",
      entityType: "FUND_SIGNAL",
      entityId: input.id,
      requestId: requestId(request),
      detail: input,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
