export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hasSpecialPermissionsPassword,
  verifySpecialPermissionsPassword,
  type SpecialPermissionsStoredLink,
} from "@/lib/specialPermissions";

const specialAccessSchema = z.object({
  password: z.string().optional().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = specialAccessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, links, disabled")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return NextResponse.json({ error: "Bundle is offline." }, { status: 410 });
  }

  const links = bundle.links as SpecialPermissionsStoredLink[];

  if (!hasSpecialPermissionsPassword(links)) {
    return NextResponse.json(
      { error: "Special permissions are not configured." },
      { status: 409 },
    );
  }

  if (!verifySpecialPermissionsPassword(parsed.data.password, links)) {
    return NextResponse.json(
      { error: "Invalid special permissions password." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
