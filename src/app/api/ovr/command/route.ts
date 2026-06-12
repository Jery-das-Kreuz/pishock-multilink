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
  paused: boolean;
};

const numberFromJson = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return value;
}, z.number());

const commandSchema = z.object({
  bundleId: z.string().trim().min(1),
  username: z.string().trim().min(1).max(32),
  accessPassword: z.string().optional().default(""),
  target: z.union([z.literal("all"), z.string().uuid()]),
  mode: z.enum(["s", "v", "e"]),
  intensity: numberFromJson.optional().default(0),
  durationSeconds: numberFromJson.optional().default(0),
  warning: z.boolean().optional().default(false),
  warningLevel: numberFromJson.optional().default(0),
});

function clamp(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(safeValue, max));
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

function maxDurationSeconds(link: StoredLink): number {
  return link.maxDurationSeconds ?? Math.max(0.1, Math.floor(link.maxDuration / 1000));
}

function effectiveMaxIntensity(link: StoredLink, mode: "s" | "v" | "e") {
  if (mode === "e") return 0;

  const fallback = link.intensityLimit ?? link.maxIntensity;

  return Math.min(
    link.maxIntensity,
    mode === "s"
      ? link.shockIntensityLimit ?? fallback
      : link.vibrateIntensityLimit ?? fallback
  );
}

function effectiveMaxDurationSeconds(link: StoredLink, mode: "s" | "v" | "e") {
  if (mode === "e") return 0;

  const fallback = maxDurationSeconds(link);

  return Math.min(
    fallback,
    mode === "s"
      ? link.shockDurationLimitSeconds ?? link.durationLimitSeconds ?? fallback
      : link.vibrateDurationLimitSeconds ?? link.durationLimitSeconds ?? fallback
  );
}

function allowedForMode(link: StoredLink, mode: "s" | "v" | "e") {
  if (link.paused) return false;
  if (mode === "s") return link.shockEnabled;
  if (mode === "v") return link.vibrateEnabled;
  return true;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = commandSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid OVR command request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const command = parsed.data;

  const { data: bundle, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, disabled, access_password_hash")
    .eq("id", command.bundleId)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return NextResponse.json({ error: "Bundle is offline." }, { status: 410 });
  }

  if (
    bundle.access_password_hash &&
    !verifyAccessPassword(command.accessPassword, bundle.access_password_hash)
  ) {
    return NextResponse.json({ error: "Invalid access password." }, { status: 403 });
  }

  const links = bundle.links as StoredLink[];
  const targetLinks = command.target === "all"
    ? links
    : links.filter((link) => link.uuid.toLowerCase() === command.target.toLowerCase());

  if (targetLinks.length === 0) {
    return NextResponse.json({ error: "Target shocker not found." }, { status: 404 });
  }

  const usableLinks = targetLinks.filter((link) => allowedForMode(link, command.mode));

  if (usableLinks.length === 0) {
    return NextResponse.json({ error: "No selected shocker allows this operation." }, { status: 403 });
  }

  const safeUsername = command.username.replace(/[^\w .-]/g, "").slice(0, 32);

  const results = await Promise.allSettled(
    usableLinks.map(async (link) => {
      const safeIntensity = command.mode === "e"
        ? 0
        : clamp(Math.round(command.intensity), 0, effectiveMaxIntensity(link, command.mode));

      const safeDurationSeconds = command.mode === "e"
        ? 0
        : clamp(command.durationSeconds, 0, effectiveMaxDurationSeconds(link, command.mode));

      const safeWarningLevel = command.warning
        ? clamp(Math.round(command.warningLevel), 1, 3)
        : 0;

      const payload = {
        Operation: "PUBLISH",
        LinkCommand: {
          Mode: command.mode,
          Intensity: safeIntensity,
          Duration: Math.round(safeDurationSeconds * 1000),
          Replace: true,
          LogData: {
            Warning: command.warning,
            Username: safeUsername,
            WarningLevel: safeWarningLevel,
            Hold: false,
          },
        },
      };

      const result = await publishToPiShock(link.uuid, payload);

      return {
        uuid: link.uuid,
        name: link.name,
        sent: payload,
        result,
      };
    })
  );

  function isFulfilled<T>(
    result: PromiseSettledResult<T>,
  ): result is PromiseFulfilledResult<T> {
    return result.status === "fulfilled";
  }

  const sent = results.filter(isFulfilled).map((result) => result.value);

  const failed = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason instanceof Error ? result.reason.message : "Unknown error");

  return NextResponse.json({
    ok: failed.length === 0,
    attempted: usableLinks.length,
    sent,
    failed,
  }, { status: failed.length === 0 ? 200 : 502 });
}
