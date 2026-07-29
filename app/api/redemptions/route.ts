import { NextResponse } from "next/server";
import { errorResponse, requestId } from "@/lib/http";
import { recordRedemption } from "@/lib/redemption-service";
import { normalizeDecimal, redemptionInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = redemptionInput.parse(await request.json());
    const result = recordRedemption({
      ...input,
      shares: normalizeDecimal(input.shares),
      confirmedNav: normalizeDecimal(input.confirmedNav),
      fee: normalizeDecimal(input.fee),
      proceeds: input.proceeds ? normalizeDecimal(input.proceeds) : undefined,
    }, requestId(request));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
