import { randomBytes } from "crypto";
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

const createBundleSchema = z.object({
  title: z.string().max(80).optional(),
  accessPassword: z.string().min(8).max(100).optional(),
  links: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        uuid: z.string().uuid(),
      })
    )
    .min(1)
    .max(10),
});

function createPiShockUrl(uuid: string): string {
  return `https://pishock.com/#/LinkControl?id=${uuid}`;
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createBundleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid bundle data.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const title = parsed.data.title?.trim() || "PiShock Bundle";
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

          forceLogin: info.ForceLogin,
          forceWarning: Boolean(info.ForceWarning),
          forceWarningLevel: 1,
          disabled: false,
          hidden: false,
          requiresSpecialPermissions: false,
          specialPermissionsPasswordHash: null,
          paused: info.Paused,
          activateOnLoad: info.ActivateOnLoad,

          remainingActivations: info.RemainingActivations,
          expiry: info.Expiry,
          lastCheckedAt: new Date().toISOString(),

          maxDurationSeconds: Math.floor(info.MaxDuration / 1000),
          vibrateIntensityLimit: info.MaxIntensity,
          vibrateDurationLimitSeconds: Math.floor(info.MaxDuration / 1000),

          shockIntensityLimit: info.MaxIntensity,
          shockDurationLimitSeconds: Math.floor(info.MaxDuration / 1000),
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

  const id = randomBytes(8).toString("hex");
  const editToken = randomBytes(24).toString("hex");

  const accessPassword = parsed.data.accessPassword?.trim();

  const accessPasswordHash = accessPassword
    ? hashAccessPassword(accessPassword)
    : null;

  const { error } = await supabaseAdmin.from("bundles").insert({
    id,
    title,
    links: checkedLinks,
    edit_token: editToken,
    access_password_hash: accessPasswordHash,
    show_vr_control_banner: true,
  });

  if (error) {
    console.error("Supabase insert error:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
    });

    return NextResponse.json(
        {
        error: "Could not save bundle.",
        supabase: {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
        },
        },
        { status: 500 }
    );
    }

  return NextResponse.json({
    id,
    path: `/c/${id}`,
    managePath: `/manage/${id}?token=${editToken}`,
});
}