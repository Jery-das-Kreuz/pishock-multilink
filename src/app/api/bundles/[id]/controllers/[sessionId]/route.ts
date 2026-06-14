export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEditToken } from "@/lib/bundleTokens";
import { getControllerSessionsSql, updateControllerSession } from "@/lib/controllerSessions";

const updateSchema = z.object({
  token: z.string().min(1),
  blocked: z.boolean().optional(),
  shockCooldownSeconds: z.number().int().min(0).max(3600).optional(),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid controller update request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tokenIsValid = await verifyEditToken(id, parsed.data.token);

  if (!tokenIsValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const result = await updateControllerSession({
    bundleId: id,
    sessionId,
    blocked: parsed.data.blocked,
    shockCooldownSeconds: parsed.data.shockCooldownSeconds,
  });

  if (!result.available) {
    return NextResponse.json(
      {
        error: result.error,
        setupSql: getControllerSessionsSql(),
      },
      { status: 501 }
    );
  }

  if (!result.session) {
    return NextResponse.json({ error: result.error ?? "Controller session not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    session: result.session,
  });
}
