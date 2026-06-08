export const runtime = "nodejs";

import { NextResponse } from "next/server";
import WebSocket from "ws";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

  forceLogin: boolean;
  forceWarning: boolean;
  paused: boolean;
  activateOnLoad: boolean;

  remainingActivations: number;
  expiry: string | null;
  lastCheckedAt: string;
};

const operateSchema = z.object({
  uuid: z.string().uuid(),
  username: z.string().trim().min(1).max(32),

  mode: z.enum(["s", "v", "e"]),

  intensity: z.number().int().min(0).max(100),
  duration: z.number().int().min(0).max(30000),

  warning: z.boolean().default(false),
  warningLevel: z.number().int().min(0).max(3).default(0),

  hold: z.boolean().default(false),
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function publishToPiShock(
  uuid: string,
  payload: unknown
): Promise<unknown> {
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
    .select("id, title, links, disabled")
    .eq("id", id)
    .single();

  if (error || !bundle) {
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
  }

  if (bundle.disabled) {
    return NextResponse.json(
      { error: "Bundle is disabled." },
      { status: 410 }
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

  const safeUsername = command.username
    .replace(/[^\w .-]/g, "")
    .slice(0, 32);

  const safeIntensity =
    command.mode === "e"
      ? 0
      : clamp(command.intensity, 0, link.maxIntensity);

  const safeDuration =
    command.mode === "e"
      ? 0
      : clamp(command.duration, 0, link.maxDuration);

  const safeWarningLevel = command.warning
    ? clamp(command.warningLevel, 1, 3)
    : 0;

  const payload = {
    Operation: "PUBLISH",
    LinkCommand: {
      Mode: command.mode,
      Intensity: safeIntensity,
      Duration: safeDuration,
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