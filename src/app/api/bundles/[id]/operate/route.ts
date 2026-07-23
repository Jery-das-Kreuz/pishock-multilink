export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import WebSocket from "ws";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";
import { createPublicLinkId } from "@/lib/publicBundleLinks";
import {
  getShockCooldownError,
  markControllerShock,
  touchControllerSession,
} from "@/lib/controllerSessions";
import {
  attachControllerCookie,
  resolveControllerId,
} from "@/lib/controllerIdentity";
import {
  getSpecialPermissionsPasswordHash,
  verifySpecialPermissionsPassword,
} from "@/lib/specialPermissions";

type StoredLink = {
  name: string;
  uuid: string;
  url: string;
  pishockName: string;
  linkId: number;
  ownerId: number;
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
  forceWarning: boolean;
  forceWarningLevel?: number;
  disabled?: boolean;
  requiresSpecialPermissions?: boolean;
  specialPermissionsPasswordHash?: string | null;
  paused: boolean;
  activateOnLoad: boolean;
  remainingActivations: number;
  expiry: string | null;
  lastCheckedAt: string;
};

const numberFromJson = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number());

const operateSchema = z.object({
  linkId: z.string().trim().min(16).max(128),
  username: z.string().trim().min(1).max(32),
  accessPassword: z.string().optional().default(""),
  specialPermissionsPassword: z.string().optional().default(""),
  sessionId: z.string().trim().min(8).max(120).optional(),
  mode: z.enum(["s", "v", "e"]),
  intensity: numberFromJson.optional().default(0),
  durationSeconds: numberFromJson.optional(),
  duration: numberFromJson.optional(),
  warning: z.boolean().optional().default(false),
  warningLevel: numberFromJson.optional().default(0),
  hold: z.boolean().optional().default(false),
});

function clamp(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(safeValue, max));
}

function getRequestedDurationSeconds(command: {
  durationSeconds?: number;
  duration?: number;
}): number {
  if (typeof command.durationSeconds === "number") return command.durationSeconds;
  if (typeof command.duration === "number") {
    return command.duration > 60 ? command.duration / 1000 : command.duration;
  }
  return 0;
}

function publishToPiShock(uuid: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://broker.pishock.com/Links/${uuid}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("PiShock WebSocket timeout."));
    }, 8000);

    ws.on("open", () => ws.send(JSON.stringify(payload)));
    ws.on("message", (data) => {
      clearTimeout(timeout);
      const text = data.toString();
      try {
        resolve(JSON.parse(text));
      } catch {
        resolve({ raw: text });
      } finally {
        ws.close();
      }
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    ws.on("close", () => clearTimeout(timeout));
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = operateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid operate request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const command = parsed.data;
  const controllerId = resolveControllerId(request, id, command.sessionId);
  const respond = (payload: Record<string, unknown>, init?: ResponseInit) =>
    attachControllerCookie(NextResponse.json(payload, init), id, controllerId);

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return respond({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return respond({ error: "Bundle is offline." }, { status: 410 });
  }

  if (
    bundle.access_password_hash &&
    !verifyAccessPassword(command.accessPassword, bundle.access_password_hash)
  ) {
    return respond({ error: "Invalid access password." }, { status: 403 });
  }

  const links = bundle.links as StoredLink[];
  const link = links.find(
    (item) => createPublicLinkId(id, item.uuid) === command.linkId,
  );

  if (!link) {
    return respond(
      { error: "This device is not part of this bundle." },
      { status: 403 },
    );
  }

  if (link.disabled) {
    return respond(
      { error: "This shocker is disabled by the bundle manager." },
      { status: 403 },
    );
  }

  if (link.paused) {
    return respond({ error: "This link is paused." }, { status: 403 });
  }

  if (
    command.mode !== "e" &&
    link.requiresSpecialPermissions &&
    !verifySpecialPermissionsPassword(command.specialPermissionsPassword, links)
  ) {
    const configured = Boolean(getSpecialPermissionsPasswordHash(links));
    return respond(
      {
        error: configured
          ? "Special permissions password required for this shocker."
          : "Special permissions are not configured correctly.",
        specialPermissionsRequired: true,
      },
      { status: 403 },
    );
  }

  if (command.mode === "s" && !link.shockEnabled) {
    return respond(
      { error: "Shock is not enabled for this link." },
      { status: 403 },
    );
  }

  if (command.mode === "v" && !link.vibrateEnabled) {
    return respond(
      { error: "Vibrate is not enabled for this link." },
      { status: 403 },
    );
  }

  const maxDurationSeconds =
    link.maxDurationSeconds ?? Math.max(0.1, Math.floor(link.maxDuration / 1000));
  const effectiveMaxIntensity =
    command.mode === "s"
      ? Math.min(
          link.maxIntensity,
          link.shockIntensityLimit ?? link.intensityLimit ?? link.maxIntensity,
        )
      : command.mode === "v"
        ? Math.min(
            link.maxIntensity,
            link.vibrateIntensityLimit ?? link.intensityLimit ?? link.maxIntensity,
          )
        : 0;
  const effectiveMaxDurationSeconds =
    command.mode === "s"
      ? Math.min(
          maxDurationSeconds,
          link.shockDurationLimitSeconds ??
            link.durationLimitSeconds ??
            maxDurationSeconds,
        )
      : command.mode === "v"
        ? Math.min(
            maxDurationSeconds,
            link.vibrateDurationLimitSeconds ??
              link.durationLimitSeconds ??
              maxDurationSeconds,
          )
        : 0;

  const safeUsername = command.username.replace(/[^\w .-]/g, "").slice(0, 32);
  const controllerResult = await touchControllerSession({
    bundleId: id,
    sessionId: controllerId,
    username: safeUsername,
    userAgent: request.headers.get("user-agent"),
  });
  const controllerPolicy = controllerResult.policy;

  if (controllerPolicy?.blocked) {
    return respond(
      {
        error: "Your controls are blocked by the bundle manager.",
        controllerPolicy,
      },
      { status: 403 },
    );
  }

  if (command.mode === "s" && controllerPolicy) {
    const cooldownError = getShockCooldownError(controllerPolicy);
    if (cooldownError) {
      return respond(
        { error: cooldownError, controllerPolicy },
        { status: 429 },
      );
    }
  }

  const safeIntensity =
    command.mode === "e"
      ? 0
      : clamp(Math.round(command.intensity), 0, effectiveMaxIntensity);
  const safeDurationSeconds =
    command.mode === "e"
      ? 0
      : clamp(
          getRequestedDurationSeconds(command),
          0,
          effectiveMaxDurationSeconds,
        );
  const warningForced = command.mode === "s" && Boolean(link.forceWarning);
  const effectiveWarning =
    command.mode === "s" && (warningForced || command.warning);
  const safeWarningLevel = effectiveWarning
    ? clamp(
        Math.round(
          warningForced ? link.forceWarningLevel ?? 1 : command.warningLevel,
        ),
        1,
        3,
      )
    : 0;

  const payload = {
    Operation: "PUBLISH",
    LinkCommand: {
      Mode: command.mode,
      Intensity: safeIntensity,
      Duration: Math.round(safeDurationSeconds * 1000),
      Replace: true,
      LogData: {
        Warning: effectiveWarning,
        Username: safeUsername,
        WarningLevel: safeWarningLevel,
        Hold: command.hold,
      },
    },
  };

  try {
    const result = await publishToPiShock(link.uuid, payload);
    if (command.mode === "s") {
      await markControllerShock(id, controllerId);
    }

    const message =
      result &&
      typeof result === "object" &&
      "Message" in result &&
      typeof (result as { Message?: unknown }).Message === "string"
        ? (result as { Message: string }).Message
        : "Command sent.";

    return respond({ ok: true, message, controllerPolicy });
  } catch (publishError) {
    console.error("Operate publish error:", publishError);
    return respond(
      { error: "Could not publish command." },
      { status: 502 },
    );
  }
}
