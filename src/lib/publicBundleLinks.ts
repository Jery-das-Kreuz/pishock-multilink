import { createHmac } from "crypto";

type StoredLink = {
  name: string;
  uuid: string;

  shockEnabled: boolean;
  vibrateEnabled: boolean;
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
  paused: boolean;
};

export type PublicBundleLink = {
  id: string;
  name: string;

  shockEnabled: boolean;
  vibrateEnabled: boolean;

  vibrateIntensityLimit: number;
  vibrateDurationLimitSeconds: number;
  shockIntensityLimit: number;
  shockDurationLimitSeconds: number;

  forceLogin: boolean;
  forceWarning: boolean;
  forceWarningLevel: number;
  disabled: boolean;
  requiresSpecialPermissions: boolean;
  paused: boolean;
};

function getPublicLinkSecret(): string {
  const secret =
    process.env.PUBLIC_LINK_ID_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "PUBLIC_LINK_ID_SECRET or SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  }

  return secret;
}

function clamp(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(safeValue, max));
}

function getMaxDurationSeconds(link: StoredLink): number {
  return Math.max(
    0.1,
    link.maxDurationSeconds ?? Math.floor(link.maxDuration / 1000),
  );
}

export function createPublicLinkId(bundleId: string, uuid: string): string {
  const bytes = createHmac("sha256", getPublicLinkSecret())
    .update(`bundle-link:${bundleId}:${uuid.toLowerCase()}`)
    .digest()
    .subarray(0, 16);

  // Keep a UUID-compatible shape for existing clients while ensuring that the
  // value is a keyed, non-reversible alias rather than the PiShock UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toPublicBundleLink(
  bundleId: string,
  link: StoredLink,
): PublicBundleLink {
  const maxDurationSeconds = getMaxDurationSeconds(link);
  const legacyIntensityLimit = link.intensityLimit ?? link.maxIntensity;
  const legacyDurationLimit =
    link.durationLimitSeconds ?? maxDurationSeconds;

  return {
    id: createPublicLinkId(bundleId, link.uuid),
    name: link.name,

    shockEnabled: Boolean(link.shockEnabled),
    vibrateEnabled: Boolean(link.vibrateEnabled),

    vibrateIntensityLimit: clamp(
      link.vibrateIntensityLimit ?? legacyIntensityLimit,
      0,
      link.maxIntensity,
    ),
    vibrateDurationLimitSeconds: clamp(
      link.vibrateDurationLimitSeconds ?? legacyDurationLimit,
      0.1,
      maxDurationSeconds,
    ),
    shockIntensityLimit: clamp(
      link.shockIntensityLimit ?? legacyIntensityLimit,
      0,
      link.maxIntensity,
    ),
    shockDurationLimitSeconds: clamp(
      link.shockDurationLimitSeconds ?? legacyDurationLimit,
      0.1,
      maxDurationSeconds,
    ),

    forceLogin: Boolean(link.forceLogin),
    forceWarning: Boolean(link.forceWarning),
    forceWarningLevel: clamp(
      Math.round(link.forceWarningLevel ?? 1),
      1,
      3,
    ),
    disabled: Boolean(link.disabled),
    requiresSpecialPermissions: Boolean(link.requiresSpecialPermissions),
    paused: Boolean(link.paused),
  };
}
