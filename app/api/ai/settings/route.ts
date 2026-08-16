import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase, runInTransaction } from "@/db";
import { aiSettings } from "@/db/schema";
import { createAuditLog } from "@/db/audit";
import { errorResponse, requestId } from "@/lib/http";
import { aiSettingsInput } from "@/lib/validation";

export const runtime = "nodejs";

const AI_SETTINGS_ID = "00000000-0000-4000-8000-000000000002";

function safeSettings(row: typeof aiSettings.$inferSelect | undefined) {
  return row ? {
    providerName: row.providerName,
    baseUrl: row.baseUrl,
    model: row.model,
    hasApiKey: Boolean(row.apiKey),
    maskedApiKey: row.apiKey ? `${row.apiKey.slice(0, 4)}••••${row.apiKey.slice(-4)}` : "",
    updatedAt: row.updatedAt,
  } : {
    providerName: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hasApiKey: false,
    maskedApiKey: "",
    updatedAt: null,
  };
}

export async function GET() {
  const row = ensureDatabase().select().from(aiSettings)
    .where(eq(aiSettings.id, AI_SETTINGS_ID)).get();
  return NextResponse.json(safeSettings(row));
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const input = aiSettingsInput.parse(await request.json());
    const saved = runInTransaction((tx) => {
      const previous = tx.select().from(aiSettings).where(eq(aiSettings.id, AI_SETTINGS_ID)).get();
      const now = new Date().toISOString();
      const row = {
        id: AI_SETTINGS_ID,
        providerName: input.providerName,
        baseUrl: input.baseUrl.replace(/\/+$/, ""),
        model: input.model,
        apiKey: input.apiKey || previous?.apiKey || "",
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      if (previous) {
        tx.update(aiSettings).set(row).where(eq(aiSettings.id, AI_SETTINGS_ID)).run();
      } else {
        tx.insert(aiSettings).values(row).run();
      }
      createAuditLog(tx, {
        operationType: previous ? "UPDATE" : "CREATE",
        entityType: "AI_ASSISTANT_SETTING",
        entityId: AI_SETTINGS_ID,
        requestId: reqId,
        detail: {
          providerName: row.providerName,
          baseUrl: row.baseUrl,
          model: row.model,
          hasApiKey: Boolean(row.apiKey),
        },
      });
      return row;
    });
    return NextResponse.json(safeSettings(saved));
  } catch (error) {
    return errorResponse(error);
  }
}
