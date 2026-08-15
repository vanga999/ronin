import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { fundNavs, instruments } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const database = ensureDatabase();
  const funds = database.select().from(instruments).all();
  const rows = funds.map((fund) => ({
    ...fund,
    latestNav: database.select().from(fundNavs)
      .where(eq(fundNavs.instrumentId, fund.id))
      .orderBy(desc(fundNavs.navDate))
      .limit(1)
      .get() ?? null,
  }));
  return NextResponse.json(rows);
}
