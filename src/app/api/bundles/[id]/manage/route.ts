export const runtime = "nodejs";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashAccessPassword } from "@/lib/accessPassword";

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
});

const updateBundleSchema = z.object({
  token: z.string().min(1),
  title: z.string().trim().min(1).max(80),
  disabled: z.boolean(),
  accessPassword: z.string().max(100).optional(),
  clearAccessPassword: z.boolean().optional(),
  links: z.array(managedLinkSchema).min(1).max(10),
});

function createPiShockUrl(uuid: string): string {
  return `https://pishock.com/#/LinkControl?id=${uuid}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function safeTokenEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
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

async function verifyEditToken(id: string, token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, edit_token")
    .eq("id", id)
    .single();

  if (error || !data || !data.edit_token) {
    return false;
  }

  return safeTokenEquals(String(data.edit_token), token);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const tokenIsValid = await verifyEditToken(id, token);

  if (!tokenIsValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, disabled, created_at, expires_at, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  return NextResponse.json({
  ...data,
  access_password_hash: undefined,
  hasAccessPassword: Boolean(data.access_password_hash),
});
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = updateBundleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid bundle data.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const tokenIsValid = await verifyEditToken(id, parsed.data.token);

  if (!tokenIsValid) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  const uniqueUuids = new Set(
    parsed.data.links.map((link) => link.uuid.toLowerCase())
  );

  if (uniqueUuids.size !== parsed.data.links.length) {
    return NextResponse.json(
      { error: "Duplicate PiShock links are not allowed." },
      { status: 400 }
    );
  }

  let checkedLinks;

  try {
    checkedLinks = await Promise.all(
      parsed.data.links.map(async (link) => {
        const info = await fetchPiShockLinkInfo(link.uuid);

        const maxDurationSeconds = Math.max(
          0.1,
          Math.floor(info.MaxDuration / 1000)
        );

        const vibrateIntensityLimit = clamp(
          link.vibrateIntensityLimit,
          0,
          info.MaxIntensity
        );

        const vibrateDurationLimitSeconds = clamp(
          link.vibrateDurationLimitSeconds,
          0.1,
          maxDurationSeconds
        );

        const shockIntensityLimit = clamp(
          link.shockIntensityLimit,
          0,
          info.MaxIntensity
        );

        const shockDurationLimitSeconds = clamp(
          link.shockDurationLimitSeconds,
          0.1,
          maxDurationSeconds
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

          vibrateIntensityLimit,
          vibrateDurationLimitSeconds,

          shockIntensityLimit,
          shockDurationLimitSeconds,

          forceLogin: info.ForceLogin,
          forceWarning: info.ForceWarning,
          paused: info.Paused,
          activateOnLoad: info.ActivateOnLoad,

          remainingActivations: info.RemainingActivations,
          expiry: info.Expiry,
          lastCheckedAt: new Date().toISOString(),
        };
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not verify PiShock links.",
      },
      { status: 400 }
    );
  }

  const updateData: {
    title: string;
    disabled: boolean;
    links: unknown;
    access_password_hash?: string | null;
    } = {
        title: parsed.data.title,
        disabled: parsed.data.disabled,
        links: checkedLinks,
    };

    if (parsed.data.clearAccessPassword) {
        updateData.access_password_hash = null;
        } else if (parsed.data.accessPassword?.trim()) {
            updateData.access_password_hash = hashAccessPassword(
                parsed.data.accessPassword.trim()
            );
    }

  const { error } = await supabaseAdmin
    .from("bundles")
    .update(updateData)
    .eq("id", id);

  if (error) {
    console.error("Supabase manage update error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    return NextResponse.json(
      { error: "Could not update bundle." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id,
    path: `/c/${id}`,
  });
}