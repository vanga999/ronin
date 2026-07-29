import * as XLSX from "xlsx";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { runInTransaction } from "@/db";
import { accounts, instruments, positionLots, transactions } from "@/db/schema";
import { createAuditLog } from "@/db/audit";
import {
  dateString,
  nonNegativeDecimalString,
  normalizeDecimal,
  positiveDecimalString,
} from "@/lib/validation";
import { errorResponse, requestId } from "@/lib/http";
import { generateDailySnapshots } from "@/lib/nav-service";
import { z } from "zod";

export const runtime = "nodejs";

const importRow = z.object({
  基金代码: z.coerce.string().trim().min(1),
  基金名称: z.coerce.string().trim().min(1),
  买入日期: dateString,
  买入金额: z.coerce.string().pipe(positiveDecimalString),
  买入净值: z.coerce.string().pipe(positiveDecimalString),
  买入份额: z.coerce.string().pipe(positiveDecimalString),
  申购费用: z.preprocess(
    (value) => value === "" || value === null || value === undefined ? "0" : String(value),
    nonNegativeDecimalString,
  ),
});

export const jsonPositionImportSchema = z.object({
  version: z.literal("1.0").optional().default("1.0"),
  positions: z.array(z.object({
    fundCode: z.coerce.string().trim().min(1),
    fundName: z.coerce.string().trim().min(1),
    purchaseDate: dateString,
    purchaseAmount: z.coerce.string().pipe(positiveDecimalString),
    confirmedNav: z.coerce.string().pipe(positiveDecimalString),
    confirmedShares: z.coerce.string().pipe(positiveDecimalString),
    purchaseFee: z.preprocess(
      (value) => value === "" || value === null || value === undefined ? "0" : String(value),
      nonNegativeDecimalString,
    ),
  })).min(1).max(1000),
});

function excelDate(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("format") === "json") {
    return NextResponse.json({
      version: "1.0",
      positions: [{
        fundCode: "001513",
        fundName: "易方达信息产业混合A",
        purchaseDate: "2026-07-01",
        purchaseAmount: "20000.00",
        confirmedNav: "3.2100",
        confirmedShares: "6230.5296",
        purchaseFee: "0",
      }],
    }, {
      headers: {
        "content-disposition": 'attachment; filename="fund_position_import.json"',
      },
    });
  }
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([
    {
      基金代码: "001513",
      基金名称: "示例基金A",
      买入日期: "2026-07-01",
      买入金额: "20000.00",
      买入净值: "3.2100",
      买入份额: "6230.5296",
      申购费用: "0",
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "fund_position_import");
  const body = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(body, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="fund_position_import.xlsx"',
    },
  });
}

export async function POST(request: Request) {
  const reqId = requestId(request);
  try {
    const form = await request.formData();
    const accountId = z.string().uuid().parse(form.get("accountId"));
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择 Excel 或 JSON 文件" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "文件不能超过 5MB" }, { status: 400 });
    }

    const isJson = file.name.toLowerCase().endsWith(".json") || file.type === "application/json";
    const sourceType = isJson ? "JSON" : "EXCEL";
    let rows: z.infer<typeof importRow>[];
    if (isJson) {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        return NextResponse.json({ error: "JSON 文件格式不正确" }, { status: 400 });
      }
      const parsed = jsonPositionImportSchema.parse(raw);
      rows = parsed.positions.map((row) => ({
        基金代码: row.fundCode,
        基金名称: row.fundName,
        买入日期: row.purchaseDate,
        买入金额: row.purchaseAmount,
        买入净值: row.confirmedNav,
        买入份额: row.confirmedShares,
        申购费用: row.purchaseFee,
      }));
    } else {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const worksheet = workbook.Sheets.fund_position_import;
      if (!worksheet) {
        return NextResponse.json({ error: "缺少 fund_position_import 工作表" }, { status: 400 });
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (rawRows.length === 0) {
        return NextResponse.json({ error: "导入表没有数据" }, { status: 400 });
      }
      if (rawRows.length > 1000) {
        return NextResponse.json({ error: "单次最多导入 1000 行" }, { status: 400 });
      }
      rows = rawRows.map((row, index) => {
        const result = importRow.safeParse({ ...row, 买入日期: excelDate(row.买入日期) });
        if (!result.success) {
          throw new Error(`第 ${index + 2} 行数据错误：${result.error.issues[0]?.message ?? "格式错误"}`);
        }
        return result.data;
      });
    }

    const result = runInTransaction((tx) => {
      if (!tx.select().from(accounts).where(eq(accounts.id, accountId)).get()) {
        throw new Error("导入账户不存在");
      }
      let fundsCreated = 0;
      const lotIds: string[] = [];
      for (const row of rows) {
        let fund = tx.select().from(instruments).where(and(
          eq(instruments.code, row.基金代码),
          eq(instruments.instrumentType, "MUTUAL_FUND"),
        )).get();
        const now = new Date().toISOString();
        if (!fund) {
          fund = {
            id: crypto.randomUUID(),
            code: row.基金代码,
            name: row.基金名称,
            instrumentType: "MUTUAL_FUND",
            fundCompany: null,
            fundType: null,
            shareClass: null,
            investmentTheme: null,
            riskLevel: null,
            dataSource: null,
            createdAt: now,
            updatedAt: now,
          };
          tx.insert(instruments).values(fund).run();
          fundsCreated += 1;
        }
        const lotId = crypto.randomUUID();
        const amount = normalizeDecimal(row.买入金额);
        const nav = normalizeDecimal(row.买入净值);
        const shares = normalizeDecimal(row.买入份额);
        const fee = normalizeDecimal(row.申购费用);
        tx.insert(positionLots).values({
          id: lotId,
          accountId,
          instrumentId: fund.id,
          purchaseDate: row.买入日期,
          purchaseAmount: amount,
          confirmedNav: nav,
          confirmedShares: shares,
          remainingShares: shares,
          remainingPrincipal: amount,
          purchaseFee: fee,
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        }).run();
        tx.insert(transactions).values({
          id: crypto.randomUUID(),
          accountId,
          instrumentId: fund.id,
          lotId,
          transactionType: "SUBSCRIBE",
          transactionDate: row.买入日期,
          amount,
          nav,
          shares,
          fee,
          note: `${sourceType} 导入`,
          createdAt: now,
          updatedAt: now,
        }).run();
        lotIds.push(lotId);
      }
      createAuditLog(tx, {
        operationType: "BULK_IMPORT",
        entityType: "POSITION_LOT",
        requestId: reqId,
        detail: { accountId, fileName: file.name, sourceType, rowCount: rows.length, lotIds },
      });
      return { importedLots: rows.length, fundsCreated };
    });
    generateDailySnapshots(reqId);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("第 ")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return errorResponse(error);
  }
}
