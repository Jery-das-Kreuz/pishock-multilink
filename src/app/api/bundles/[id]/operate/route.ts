export const runtime = "nodejs";

import { NextResponse } from "next/server";
import WebSocket from "ws";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAccessPassword } from "@/lib/accessPassword";

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

  // Legacy fallback fields for old bundles.
  intensityLimit?: number;
  durationLimitSeconds?: number;

  forceLogin: boolean;
  forceWarning: boolean;
  paused: boolean;
  activateOnLoad: boolean;

  remainingActivations: number;
  expiry: string | null;
  lastCheckedAt: string;
};

const numberFromJson = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return value;
}, z.number());

const operateSchema = z.object({
  uuid: z.string().uuid(),
  username: z.string().trim().min(1).max(32),
  accessPassword: z.string().optional().default(""),

  mode: z.enum(["s", "v", "e"]),

  intensity: numberFromJson.optional().default(0),

  // New field: seconds.
  durationSeconds: numberFromJson.optional(),

  // Legacy field: sometimes milliseconds, sometimes seconds depending on old UI.
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
  if (typeof command.durationSeconds === "number") {
    return command.durationSeconds;
  }

  if (typeof command.duration === "number") {
    // Legacy compatibility:
    // values above 60 are almost certainly milliseconds from the old UI.
    if (command.duration > 60) {
      return command.duration / 1000;
    }

    // Small values are treated as seconds.
    return command.duration;
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

    ws.on("open", () => {
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (data) => {
      clearTimeout(timeout);

      const text = data.toString();

      try {
        const parsed = JSON.parse(text);
        ws.close();
        resolve(parsed);
      } catch {
        ws.close();
        resolve({ raw: text });
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on("close", () => {
      clearTimeout(timeout);
    });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const body = await request.json().catch(() => null);
  const parsed = operateSchema.safeParse(body);

  if (!parsed.success) {
    console.error("Operate validation error:", {
      body,
      details: parsed.error.flatten(),
    });

    return NextResponse.json(
      {
        error: "Invalid operate request.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const command = parsed.data;

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return NextResponse.json(
      { error: "Bundle is offline." },
      { status: 410 }
    );
  }

  if (
    bundle.access_password_hash &&
    !verifyAccessPassword(command.accessPassword, bundle.access_password_hash)
  ) {
    return NextResponse.json(
      { error: "Invalid access password." },
      { status: 403 }
    );
  }

  const links = bundle.links as StoredLink[];

  const link = links.find(
    (item) => item.uuid.toLowerCase() === command.uuid.toLowerCase()
  );

  if (!link) {
    return NextResponse.json(
      { error: "This PiShock link is not part of this bundle." },
      { status: 403 }
    );
  }

  if (link.paused) {
    return NextResponse.json({ error: "This link is paused." }, { status: 403 });
  }

  if (link.forceLogin) {
    return NextResponse.json(
      { error: "This link requires login and cannot be used here." },
      { status: 403 }
    );
  }

  if (command.mode === "s" && !link.shockEnabled) {
    return NextResponse.json(
      { error: "Shock is not enabled for this link." },
      { status: 403 }
    );
  }

  if (command.mode === "v" && !link.vibrateEnabled) {
    return NextResponse.json(
      { error: "Vibrate is not enabled for this link." },
      { status: 403 }
    );
  }

  const maxDurationSeconds =
    link.maxDurationSeconds ?? Math.max(0.1, Math.floor(link.maxDuration / 1000));

  const effectiveMaxIntensity =
    command.mode === "s"
      ? Math.min(
          link.maxIntensity,
          link.shockIntensityLimit ?? link.intensityLimit ?? link.maxIntensity
        )
      : command.mode === "v"
        ? Math.min(
            link.maxIntensity,
            link.vibrateIntensityLimit ??
              link.intensityLimit ??
              link.maxIntensity
          )
        : 0;

  const effectiveMaxDurationSeconds =
    command.mode === "s"
      ? Math.min(
          maxDurationSeconds,
          link.shockDurationLimitSeconds ??
            link.durationLimitSeconds ??
            maxDurationSeconds
        )
      : command.mode === "v"
        ? Math.min(
            maxDurationSeconds,
            link.vibrateDurationLimitSeconds ??
              link.durationLimitSeconds ??
              maxDurationSeconds
          )
        : 0;

  const safeUsername = command.username
    .replace(/[^\w .-]/g, "")
    .slice(0, 32);

  const safeIntensity =
    command.mode === "e"
      ? 0
      : clamp(Math.round(command.intensity), 0, effectiveMaxIntensity);

  const requestedDurationSeconds = getRequestedDurationSeconds(command);

  const safeDurationSeconds =
    command.mode === "e"
      ? 0
      : clamp(requestedDurationSeconds, 0, effectiveMaxDurationSeconds);

  const safeDurationMs = Math.round(safeDurationSeconds * 1000);

  const safeWarningLevel = command.warning
    ? clamp(Math.round(command.warningLevel), 1, 3)
    : 0;

  const payload = {
    Operation: "PUBLISH",
    LinkCommand: {
      Mode: command.mode,
      Intensity: safeIntensity,
      Duration: safeDurationMs,
      Replace: true,
      LogData: {
        Warning: command.warning,
        Username: safeUsername,
        WarningLevel: safeWarningLevel,
        Hold: command.hold,
      },
    },
  };

  try {
    const result = await publishToPiShock(command.uuid, payload);

    return NextResponse.json({
      ok: true,
      sent: payload,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not publish command.",
      },
      { status: 502 }
    );
  }
}