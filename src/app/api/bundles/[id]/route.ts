import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, created_at, expires_at, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  const { access_password_hash: accessPasswordHash, ...publicBundle } = data;

  return NextResponse.json({
    ...publicBundle,
    hasAccessPassword: Boolean(accessPasswordHash),
  });
}
