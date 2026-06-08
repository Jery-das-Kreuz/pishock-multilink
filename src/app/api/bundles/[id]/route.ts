import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, created_at, expires_at, disabled")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (data.disabled) {
    return NextResponse.json(
      { error: "Bundle is disabled." },
      { status: 410 }
    );
  }

  return NextResponse.json(data);
}