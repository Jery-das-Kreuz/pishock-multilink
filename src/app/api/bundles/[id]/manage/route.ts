export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashAccessPassword } from "@/lib/accessPassword";
import { verifyEditToken } from "@/lib/bundleTokens";
import {
  getSpecialPermissionsPasswordHash,
  hasSpecialPermissionsPassword,
  removeSpecialPermissionsSecrets,
  type SpecialPermissionsStoredLink,
} from "@/lib/specialPermissions";

type PiShockLinkInfo = {
  LinkId: number;
  Name: string;
  Paused: boolean;
  UserId: number | null;
  OwnerId: number;
  RemainingActivations: number;
  ShowCountdown: boolean;
  ShowUsages: boolean;
  ShockEnabled: boolean;
  VibrateEnabled: boolean;
  BeepEnabled: boolean;
  MaxIntensity: number;
  MaxDuration: number;
  ForceWarning: boolean;
  ForceLogin: boolean;
  ActivateOnLoad: boolean;
  Expiry: string | null;
};

const managedLinkSchema = z.object({
  name: z.string().trim().min(1).max(40),
  uuid: z.string().uuid(),
  vibrateIntensityLimit: z.number().int().min(0).max(100),
  vibrateDurationLimitSeconds: z.number().min(0.1).max(60),
  shockIntensityLimit: z.number().int().min(0).max(100),
  shockDurationLimitSeconds: z.number().min(0.1).max(60),
  forceWarning: z.boolean().optional().default(false),
  forceWarningLevel: z.number().int().min(1).max(3).optional().default(1),
  disabled: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  requiresSpecialPermissions: z.boolean().optional().default(false),
});

const updateBundleSchema = z.object({
  token: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  disabled: z.boolean(),
  showVrControlBanner: z.boolean(),
  accessPassword: z.string().max(100).optional(),
  clearAccessPassword: z.boolean().optional(),
  specialPermissionsPassword: z.string().min(8).max(100).optional(),
  clearSpecialPermissionsPassword: z.boolean().optional(),
  links: z.array(managedLinkSchema).min(1).max(10),
});

function createPiShockUrl(uuid: string): string {
  return `https://pishock.com/#/LinkControl?id=${uuid}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

async function fetchPiShockLinkInfo(uuid: string): Promise<PiShockLinkInfo> {
  const response = await fetch(`https://api.pishock.com/Links/${uuid}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PiShock link ${uuid} could not be verified.`);
  }

  return response.json();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  if (!(await verifyEditToken(id, token))) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select(
      "id, title, links, disabled, created_at, expires_at, access_password_hash, show_vr_control_banner",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  const storedLinks = data.links as SpecialPermissionsStoredLink[];

  return NextResponse.json({
    id: data.id,
    title: data.title,
    links: removeSpecialPermissionsSecrets(storedLinks),
    disabled: Boolean(data.disabled),
    showVrControlBanner: data.show_vr_control_banner !== false,
    created_at: data.created_at,
    expires_at: data.expires_at,
    hasAccessPassword: Boolean(data.access_password_hash),
    hasSpecialPermissionsPassword: hasSpecialPermissionsPassword(storedLinks),
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateBundleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bundle data.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!(await verifyEditToken(id, parsed.data.token))) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const uniqueUuids = new Set(
    parsed.data.links.map((link) => link.uuid.toLowerCase()),
  );

  if (uniqueUuids.size !== parsed.data.links.length) {
    return NextResponse.json(
      { error: "Duplicate PiShock links are not allowed." },
      { status: 400 },
    );
  }

  const { data: existingBundle, error: existingBundleError } =
    await supabaseAdmin
      .from("bundles")
      .select("links")
      .eq("id", id)
      .single();

  if (existingBundleError || !existingBundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  const existingLinks = existingBundle.links as SpecialPermissionsStoredLink[];
  let specialPermissionsPasswordHash =
    getSpecialPermissionsPasswordHash(existingLinks);

  if (parsed.data.clearSpecialPermissionsPassword) {
    specialPermissionsPasswordHash = null;
  } else if (parsed.data.specialPermissionsPassword?.trim()) {
    specialPermissionsPasswordHash = hashAccessPassword(
      parsed.data.specialPermissionsPassword.trim(),
    );
  }

  const protectedLinksExist = parsed.data.links.some(
    (link) => link.requiresSpecialPermissions,
  );

  if (protectedLinksExist && !specialPermissionsPasswordHash) {
    return NextResponse.json(
      {
        error:
          "Set a special permissions password before protecting shockers.",
      },
      { status: 400 },
    );
  }

  let checkedLinks;

  try {
    checkedLinks = await Promise.all(
      parsed.data.links.map(async (link) => {
        const info = await fetchPiShockLinkInfo(link.uuid);
        const maxDurationSeconds = Math.max(
          0.1,
          Math.floor(info.MaxDuration / 1000),
        );

        return {
          name: link.name,
          uuid: link.uuid,
          url: createPiShockUrl(link.uuid),
          pishockName: info.Name,
          linkId: info.LinkId,
          ownerId: info.OwnerId,
          shockEnabled: info.ShockEnabled,
          vibrateEnabled: info.VibrateEnabled,
          beepEnabled: info.BeepEnabled,
          maxIntensity: info.MaxIntensity,
          maxDuration: info.MaxDuration,
          maxDurationSeconds,
          vibrateIntensityLimit: clamp(
            link.vibrateIntensityLimit,
            0,
            info.MaxIntensity,
          ),
          vibrateDurationLimitSeconds: clamp(
            link.vibrateDurationLimitSeconds,
            0.1,
            maxDurationSeconds,
          ),
          shockIntensityLimit: clamp(
            link.shockIntensityLimit,
            0,
            info.MaxIntensity,
          ),
          shockDurationLimitSeconds: clamp(
            link.shockDurationLimitSeconds,
            0.1,
            maxDurationSeconds,
          ),
          forceLogin: info.ForceLogin,
          forceWarning: Boolean(link.forceWarning),
          forceWarningLevel: clamp(link.forceWarningLevel ?? 1, 1, 3),
          disabled: Boolean(link.disabled),
          hidden: Boolean(link.hidden),
          requiresSpecialPermissions: Boolean(
            link.requiresSpecialPermissions,
          ),
          specialPermissionsPasswordHash,
          paused: info.Paused,
          activateOnLoad: info.ActivateOnLoad,
          remainingActivations: info.RemainingActivations,
          expiry: info.Expiry,
          lastCheckedAt: new Date().toISOString(),
        };
      }),
    );
  } catch (verificationError) {
    return NextResponse.json(
      {
        error:
          verificationError instanceof Error
            ? verificationError.message
            : "Could not verify PiShock links.",
      },
      { status: 400 },
    );
  }

  const updateData: {
    title: string;
    disabled: boolean;
    show_vr_control_banner: boolean;
    links: unknown;
    access_password_hash?: string | null;
  } = {
    title: parsed.data.title,
    disabled: parsed.data.disabled,
    show_vr_control_banner: parsed.data.showVrControlBanner,
    links: checkedLinks,
  };

  if (parsed.data.clearAccessPassword) {
    updateData.access_password_hash = null;
  } else if (parsed.data.accessPassword?.trim()) {
    updateData.access_password_hash = hashAccessPassword(
      parsed.data.accessPassword.trim(),
    );
  }

  const { error } = await supabaseAdmin
    .from("bundles")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Supabase manage update error:", error);
    return NextResponse.json(
      { error: "Could not update bundle." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id, path: `/c/${id}` });
}
