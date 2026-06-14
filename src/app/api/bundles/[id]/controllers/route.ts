export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyEditToken } from "@/lib/bundleTokens";
import { getControllerSessionsSql, listActiveControllerSessions } from "@/lib/controllerSessions";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const tokenIsValid = await verifyEditToken(id, token);

  if (!tokenIsValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const result = await listActiveControllerSessions(id);

  if (!result.available) {
    return NextResponse.json(
      {
        error: result.error,
        setupSql: getControllerSessionsSql(),
      },
      { status: 501 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessions: result.sessions,
  });
}
