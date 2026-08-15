import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestReports } from "@/lib/nav-service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("accountId");
    const accountId = value ? z.string().uuid().parse(value) : undefined;
    return NextResponse.json(getLatestReports(accountId));
  } catch (error) {
    return errorResponse(error);
  }
}
