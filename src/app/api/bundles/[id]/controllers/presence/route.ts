export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";
import { touchControllerSession } from "@/lib/controllerSessions";

const presenceSchema = z.object({
  sessionId: z.string().trim().min(8).max(120),
  username: z.string().trim().min(1).max(32),
  accessPassword: z.string().optional().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = presenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid controller presence request." }, { status: 400 });
  }

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return NextResponse.json({ error: "Bundle is offline." }, { status: 410 });
  }

  if (
    bundle.access_password_hash &&
    !verifyAccessPassword(parsed.data.accessPassword, bundle.access_password_hash)
  ) {
    return NextResponse.json({ error: "Invalid access password." }, { status: 403 });
  }

  const result = await touchControllerSession({
    bundleId: id,
    sessionId: parsed.data.sessionId,
    username: parsed.data.username,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    ok: true,
    trackingAvailable: result.available,
    policy: result.policy,
    warning: result.error,
  });
}
