export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";

const accessSchema = z.object({
  password: z.string().optional().default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = accessSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (data.disabled) {
    return NextResponse.json({ error: "Bundle is offline." }, { status: 410 });
  }

  const requiresPassword = Boolean(data.access_password_hash);

  if (
    requiresPassword &&
    !verifyAccessPassword(parsed.data.password, data.access_password_hash)
  ) {
    return NextResponse.json({ error: "Invalid password." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    requiresPassword,
  });
}