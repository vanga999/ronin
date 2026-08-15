import { NextResponse } from "next/server";
import { errorResponse, requestId } from "@/lib/http";
import { getTodayIntradayEstimates, syncIntradayEstimates } from "@/lib/intraday-estimate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json(getTodayIntradayEstimates());
}

export async function POST(request: Request) {
  try {
    const result = await syncIntradayEstimates(requestId(request));
    return NextResponse.json({
      ...result,
      estimates: getTodayIntradayEstimates(),
      message: result.failed.length
        ? `已估算 ${result.synced.length} 只，${result.failed.length} 只失败`
        : `已更新 ${result.synced.length} 只基金的盘中估算`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
