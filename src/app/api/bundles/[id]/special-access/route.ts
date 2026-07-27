export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientIp } from "@/lib/clientIp";
import { verifyAccessPassword } from "@/lib/accessPassword";
import {
  getControllerSessionsSql,
  touchControllerSession,
} from "@/lib/controllerSessions";
import {
  attachControllerCookie,
  resolveControllerId,
} from "@/lib/controllerIdentity";
import {
  hasSpecialPermissionsPassword,
  verifySpecialPermissionsPassword,
  type SpecialPermissionsStoredLink,
} from "@/lib/specialPermissions";

const specialAccessSchema = z.object({
  password: z.string().optional().default(""),
  accessPassword: z.string().optional().default(""),
  sessionId: z.string().trim().min(8).max(120).optional(),
  username: z.string().trim().min(1).max(32),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = specialAccessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const controllerId = resolveControllerId(request, id, parsed.data.sessionId);
  const respond = (payload: Record<string, unknown>, init?: ResponseInit) =>
    attachControllerCookie(NextResponse.json(payload, init), id, controllerId);

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, links, disabled, access_password_hash")
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
    !verifyAccessPassword(
      parsed.data.accessPassword,
      bundle.access_password_hash,
    )
  ) {
    return respond({ error: "Invalid access password." }, { status: 403 });
  }

  const links = bundle.links as SpecialPermissionsStoredLink[];

  if (!hasSpecialPermissionsPassword(links)) {
    return respond(
      { error: "Special permissions are not configured." },
      { status: 409 },
    );
  }

  const controllerResult = await touchControllerSession({
    bundleId: id,
    sessionId: controllerId,
    username: parsed.data.username,
    userAgent: request.headers.get("user-agent"),
    ipAddress: getClientIp(request),
  });

  if (!controllerResult.available || !controllerResult.policy) {
    return respond(
      {
        error:
          "Special permissions cannot be verified until controller tracking is configured.",
        setupSql: getControllerSessionsSql(),
      },
      { status: 503 },
    );
  }

  if (controllerResult.policy.specialPermissionsBlocked) {
    return respond(
      {
        error: "Special permissions were blocked by the bundle manager.",
        specialPermissionsBlocked: true,
        policy: controllerResult.policy,
      },
      { status: 403 },
    );
  }

  if (controllerResult.policy.specialPermissions) {
    return respond({ ok: true, policy: controllerResult.policy });
  }

  if (!verifySpecialPermissionsPassword(parsed.data.password, links)) {
    return respond(
      { error: "Invalid special permissions password." },
      { status: 403 },
    );
  }

  return respond({ ok: true, policy: controllerResult.policy });
}
