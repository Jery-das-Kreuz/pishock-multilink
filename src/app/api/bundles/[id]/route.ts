import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toPublicBundleLink } from "@/lib/publicBundleLinks";
import { hasSpecialPermissionsPassword } from "@/lib/specialPermissions";

type StoredLink = Parameters<typeof toPublicBundleLink>[1];

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select(
      "id, title, links, created_at, expires_at, disabled, access_password_hash, show_vr_control_banner",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title,
    links: (data.links as StoredLink[])
      .filter((link) => !link.hidden)
      .map((link) => toPublicBundleLink(data.id, link)),
    created_at: data.created_at,
    expires_at: data.expires_at,
    disabled: Boolean(data.disabled),
    hasAccessPassword: Boolean(data.access_password_hash),
    showVrControlBanner: data.show_vr_control_banner !== false,
    hasSpecialPermissionsPassword: hasSpecialPermissionsPassword(
      data.links as StoredLink[],
    ),
  });
}
