import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

describe("Excel import contract", () => {
  it("reads the required worksheet and Chinese columns", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
      基金代码: "001513",
      基金名称: "测试基金",
      买入日期: "2026-07-01",
      买入金额: "20000.00",
      买入净值: "3.2100",
      买入份额: "6230.5296",
    }]), "fund_position_import");
    const reparsed = XLSX.read(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const rows = XLSX.utils.sheet_to_json(reparsed.Sheets.fund_position_import);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 基金代码: "001513", 基金名称: "测试基金" });
  });
});
