import { NextResponse } from "next/server";
import { errorResponse, requestId } from "@/lib/http";
import { syncFundNavs } from "@/lib/nav-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const result = await syncFundNavs(requestId(request));
    return NextResponse.json({
      ...result,
      message: result.failed.length
        ? `已同步 ${result.synced} 只基金，${result.failed.length} 只失败`
        : `已同步 ${result.synced} 只基金并生成日报`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
