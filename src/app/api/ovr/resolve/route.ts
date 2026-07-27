export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";
import { createPublicLinkId } from "@/lib/publicBundleLinks";
import { verifySpecialPermissionsPassword } from "@/lib/specialPermissions";

type StoredLink = {
  name: string;
  uuid: string;
  url: string;

  pishockName: string;
  shockEnabled: boolean;
  vibrateEnabled: boolean;
  beepEnabled: boolean;

  maxIntensity: number;
  maxDuration: number;
  maxDurationSeconds?: number;

  vibrateIntensityLimit?: number;
  vibrateDurationLimitSeconds?: number;
  shockIntensityLimit?: number;
  shockDurationLimitSeconds?: number;

  intensityLimit?: number;
  durationLimitSeconds?: number;

  forceLogin: boolean;
  forceWarning?: boolean;
  forceWarningLevel?: number;
  disabled?: boolean;
  hidden?: boolean;
  requiresSpecialPermissions?: boolean;
  specialPermissionsPasswordHash?: string | null;
  paused: boolean;
};

const resolveSchema = z.object({
  bundleLink: z.string().trim().min(1).optional(),
  bundleId: z.string().trim().min(1).optional(),
  accessPassword: z.string().optional().default(""),
  specialPermissionsPassword: z.string().optional().default(""),
});

function extractBundleId(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) return null;

  if (!trimmed.includes("/") && !trimmed.includes(":")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/c\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    const match = trimmed.match(/\/c\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

function maxDurationSeconds(link: StoredLink): number {
  return (
    link.maxDurationSeconds ??
    link.durationLimitSeconds ??
    Math.max(0.1, Math.floor(link.maxDuration / 1000))
  );
}

function publicLink(bundleId: string, link: StoredLink) {
  const fallbackIntensity = link.intensityLimit ?? link.maxIntensity;
  const fallbackDuration = maxDurationSeconds(link);
  const publicId = createPublicLinkId(bundleId, link.uuid);

  return {
    id: publicId,

    // Kept for compatibility with existing OVR module versions. This is an
    // opaque bundle-local identifier, not the original PiShock UUID.
    uuid: publicId,

    name: link.name,
    pishockName: link.name,
    paused: Boolean(link.paused),
    disabled: Boolean(link.disabled),
    requiresSpecialPermissions: Boolean(link.requiresSpecialPermissions),
    forceLogin: Boolean(link.forceLogin),
    forceWarning: Boolean(link.forceWarning),
    forceWarningLevel: Math.max(1, Math.min(3, Math.round(link.forceWarningLevel ?? 1))),
    shockEnabled: Boolean(link.shockEnabled),
    vibrateEnabled: Boolean(link.vibrateEnabled),
    shockMaxIntensity: Math.min(
      link.maxIntensity,
      link.shockIntensityLimit ?? fallbackIntensity
    ),
    vibrateMaxIntensity: Math.min(
      link.maxIntensity,
      link.vibrateIntensityLimit ?? fallbackIntensity
    ),
    shockMaxDurationSeconds: Math.min(
      fallbackDuration,
      link.shockDurationLimitSeconds ?? link.durationLimitSeconds ?? fallbackDuration
    ),
    vibrateMaxDurationSeconds: Math.min(
      fallbackDuration,
      link.vibrateDurationLimitSeconds ?? link.durationLimitSeconds ?? fallbackDuration
    ),
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid OVR resolve request." }, { status: 400 });
  }

  const id = parsed.data.bundleId ?? extractBundleId(parsed.data.bundleLink ?? "");

  if (!id) {
    return NextResponse.json({ error: "Could not read bundle id from link." }, { status: 400 });
  }

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  const links = bundle.links as StoredLink[];
  const requiresPassword = Boolean(bundle.access_password_hash);
  const accessGranted =
    !requiresPassword ||
    verifyAccessPassword(parsed.data.accessPassword, bundle.access_password_hash);
  const requiresSpecialPermissions = links.some(
    (link) => !link.hidden && Boolean(link.requiresSpecialPermissions),
  );
  const specialPermissionsGranted = verifySpecialPermissionsPassword(
    parsed.data.specialPermissionsPassword,
    links,
  );

  return NextResponse.json({
    ok: true,
    bundleId: bundle.id,
    title: bundle.title,
    disabled: Boolean(bundle.disabled),
    requiresPassword,
    accessGranted,
    requiresSpecialPermissions,
    specialPermissionsGranted,
    links: accessGranted
      ? links
          .filter(
            (link) =>
              !link.hidden &&
              (!link.requiresSpecialPermissions || specialPermissionsGranted),
          )
          .map((link) => publicLink(bundle.id, link))
      : [],
  });
}
