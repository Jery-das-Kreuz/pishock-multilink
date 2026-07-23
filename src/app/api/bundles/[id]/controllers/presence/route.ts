export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";
import { touchControllerSession } from "@/lib/controllerSessions";
import {
  attachControllerCookie,
  resolveControllerId,
} from "@/lib/controllerIdentity";

const presenceSchema = z.object({
  sessionId: z.string().trim().min(8).max(120).optional(),
  username: z.string().trim().min(1).max(32),
  accessPassword: z.string().optional().default(""),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = presenceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid controller presence request." },
      { status: 400 },
    );
  }

  const controllerId = resolveControllerId(request, id, parsed.data.sessionId);
  const respond = (
    payload: Record<string, unknown>,
    init?: ResponseInit,
  ) =>
    attachControllerCookie(
      NextResponse.json(payload, init),
      id,
      controllerId,
    );

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return respond({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return respond({ error: "Bundle is offline." }, { status: 410 });
  }

  if (
    bundle.access_password_hash &&
    !verifyAccessPassword(parsed.data.accessPassword, bundle.access_password_hash)
  ) {
    return respond({ error: "Invalid access password." }, { status: 403 });
  }

  const result = await touchControllerSession({
    bundleId: id,
    sessionId: controllerId,
    username: parsed.data.username,
    userAgent: request.headers.get("user-agent"),
  });

  return respond({
    ok: true,
    controllerId,
    trackingAvailable: result.available,
    policy: result.policy,
    warning: result.error,
  });
}
