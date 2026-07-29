import { NextResponse } from "next/server";
import { z } from "zod";
import { validationError } from "./validation";

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(validationError(error), { status: 400 });
  }
  if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
    return NextResponse.json({ error: "记录已存在" }, { status: 409 });
  }
  if (error instanceof Error && error.message.includes("[DecimalError]")) {
    return NextResponse.json({ error: "金额、净值或份额格式不正确" }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "服务器处理失败" }, { status: 500 });
}
