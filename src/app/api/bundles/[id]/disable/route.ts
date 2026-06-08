import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  const token = body?.token;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const { data, error: readError } = await supabaseAdmin
    .from("bundles")
    .select("id, edit_token")
    .eq("id", id)
    .single();

  if (readError || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (data.edit_token !== token) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("bundles")
    .update({ disabled: true })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not disable bundle." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}