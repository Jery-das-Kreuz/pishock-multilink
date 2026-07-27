import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const CONTROLLER_SESSIONS_TABLE = "bundle_controller_sessions";

const ACTIVE_WINDOW_MS = 20_000;

export type ControllerSessionPolicy = {
  sessionId: string;
  username: string;
  blocked: boolean;
  specialPermissions: boolean;
  specialPermissionsBlocked: boolean;
  shockCooldownSeconds: number;
  lastShockAt: string | null;
  connectedAt: string;
  lastSeenAt: string;
  remainingShockCooldownSeconds: number;
};

export type ControllerSessionAdminView = ControllerSessionPolicy & {
  ipAddress: string | null;
};

type SessionRow = {
  bundle_id: string;
  session_id: string;
  username: string;
  blocked: boolean | null;
  special_permissions: boolean | null;
  special_permissions_blocked: boolean | null;
  shock_cooldown_seconds: number | null;
  last_shock_at: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  ip_address: string | null;
};

export function sanitizeControllerName(username: string): string {
  return username.replace(/[^\w .-]/g, "").trim().slice(0, 32) || "Unknown";
}

export function controllerSessionsTableErrorMessage(): string {
  return `Controller tracking requires the ${CONTROLLER_SESSIONS_TABLE} Supabase table.`;
}

export function getControllerSessionsSql(): string {
  return `create table if not exists public.${CONTROLLER_SESSIONS_TABLE} (
  bundle_id text not null references public.bundles(id) on delete cascade,
  session_id text not null,
  username text not null,
  blocked boolean not null default false,
  special_permissions boolean not null default false,
  special_permissions_blocked boolean not null default false,
  shock_cooldown_seconds integer not null default 0,
  last_shock_at timestamptz,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent text,
  ip_address text,
  primary key (bundle_id, session_id)
);

alter table public.${CONTROLLER_SESSIONS_TABLE}
  add column if not exists special_permissions boolean not null default false;

alter table public.${CONTROLLER_SESSIONS_TABLE}
  add column if not exists special_permissions_blocked boolean not null default false;

alter table public.${CONTROLLER_SESSIONS_TABLE}
  add column if not exists ip_address text;

create index if not exists bundle_controller_sessions_last_seen_idx
  on public.${CONTROLLER_SESSIONS_TABLE} (bundle_id, last_seen_at desc);`;
}

function normalizeCooldown(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(3600, Math.round(parsed)));
}

function secondsRemaining(lastShockAt: string | null, cooldownSeconds: number): number {
  if (!lastShockAt || cooldownSeconds <= 0) return 0;

  const lastShockTime = new Date(lastShockAt).getTime();
  if (!Number.isFinite(lastShockTime)) return 0;

  const elapsedSeconds = (Date.now() - lastShockTime) / 1000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsedSeconds));
}

function publicPolicy(row: SessionRow): ControllerSessionPolicy {
  const shockCooldownSeconds = normalizeCooldown(row.shock_cooldown_seconds ?? 0);

  return {
    sessionId: row.session_id,
    username: row.username,
    blocked: Boolean(row.blocked),
    specialPermissions: Boolean(row.special_permissions),
    specialPermissionsBlocked: Boolean(row.special_permissions_blocked),
    shockCooldownSeconds,
    lastShockAt: row.last_shock_at ?? null,
    connectedAt: row.connected_at ?? new Date().toISOString(),
    lastSeenAt: row.last_seen_at ?? new Date().toISOString(),
    remainingShockCooldownSeconds: secondsRemaining(
      row.last_shock_at ?? null,
      shockCooldownSeconds
    ),
  };
}

function adminView(row: SessionRow): ControllerSessionAdminView {
  return {
    ...publicPolicy(row),
    ipAddress: row.ip_address ?? null,
  };
}

export function isLikelyMissingControllerTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  const message = String(error.message ?? "").toLowerCase();

  return (
    error.code === "42P01" ||
    message.includes(CONTROLLER_SESSIONS_TABLE) ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export async function touchControllerSession(input: {
  bundleId: string;
  sessionId: string;
  username: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{
  available: boolean;
  policy: ControllerSessionPolicy | null;
  error?: string;
}> {
  const now = new Date().toISOString();
  const username = sanitizeControllerName(input.username);

  const sessionData: Record<string, unknown> = {
    bundle_id: input.bundleId,
    session_id: input.sessionId,
    username,
    last_seen_at: now,
    user_agent: input.userAgent ?? null,
  };

  if (input.ipAddress) {
    sessionData.ip_address = input.ipAddress;
  }

  const { data, error } = await supabaseAdmin
    .from(CONTROLLER_SESSIONS_TABLE)
    .upsert(sessionData, { onConflict: "bundle_id,session_id" })
    .select(
      "bundle_id, session_id, username, blocked, special_permissions, special_permissions_blocked, shock_cooldown_seconds, last_shock_at, connected_at, last_seen_at, ip_address"
    )
    .single();

  if (error) {
    return {
      available: false,
      policy: null,
      error: controllerSessionsTableErrorMessage(),
    };
  }

  return {
    available: true,
    policy: publicPolicy(data as SessionRow),
  };
}

export async function listActiveControllerSessions(bundleId: string): Promise<{
  available: boolean;
  sessions: ControllerSessionAdminView[];
  error?: string;
}> {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from(CONTROLLER_SESSIONS_TABLE)
    .select(
      "bundle_id, session_id, username, blocked, special_permissions, special_permissions_blocked, shock_cooldown_seconds, last_shock_at, connected_at, last_seen_at, ip_address"
    )
    .eq("bundle_id", bundleId)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false });

  if (error) {
    return {
      available: false,
      sessions: [],
      error: controllerSessionsTableErrorMessage(),
    };
  }

  return {
    available: true,
    sessions: ((data ?? []) as SessionRow[]).map(adminView),
  };
}

export async function updateControllerSession(input: {
  bundleId: string;
  sessionId: string;
  blocked?: boolean;
  specialPermissions?: boolean;
  specialPermissionsBlocked?: boolean;
  shockCooldownSeconds?: number;
}): Promise<{
  available: boolean;
  session: ControllerSessionAdminView | null;
  error?: string;
}> {
  const updateData: Record<string, unknown> = {};

  if (typeof input.blocked === "boolean") {
    updateData.blocked = input.blocked;
  }

  if (typeof input.specialPermissions === "boolean") {
    updateData.special_permissions = input.specialPermissions;

    if (input.specialPermissions) {
      updateData.special_permissions_blocked = false;
    }
  }

  if (typeof input.specialPermissionsBlocked === "boolean") {
    updateData.special_permissions_blocked = input.specialPermissionsBlocked;

    if (input.specialPermissionsBlocked) {
      updateData.special_permissions = false;
    }
  }

  if (typeof input.shockCooldownSeconds === "number") {
    updateData.shock_cooldown_seconds = normalizeCooldown(input.shockCooldownSeconds);
  }

  if (Object.keys(updateData).length === 0) {
    const { data, error } = await supabaseAdmin
      .from(CONTROLLER_SESSIONS_TABLE)
      .select(
        "bundle_id, session_id, username, blocked, special_permissions, special_permissions_blocked, shock_cooldown_seconds, last_shock_at, connected_at, last_seen_at, ip_address"
      )
      .eq("bundle_id", input.bundleId)
      .eq("session_id", input.sessionId)
      .single();

    if (error || !data) {
      return {
        available: !isLikelyMissingControllerTable(error),
        session: null,
        error: isLikelyMissingControllerTable(error)
          ? controllerSessionsTableErrorMessage()
          : "Controller session not found.",
      };
    }

    return { available: true, session: adminView(data as SessionRow) };
  }

  const { data, error } = await supabaseAdmin
    .from(CONTROLLER_SESSIONS_TABLE)
    .update(updateData)
    .eq("bundle_id", input.bundleId)
    .eq("session_id", input.sessionId)
    .select(
      "bundle_id, session_id, username, blocked, special_permissions, special_permissions_blocked, shock_cooldown_seconds, last_shock_at, connected_at, last_seen_at, ip_address"
    )
    .single();

  if (error || !data) {
    return {
      available: !isLikelyMissingControllerTable(error),
      session: null,
      error: isLikelyMissingControllerTable(error)
        ? controllerSessionsTableErrorMessage()
        : "Controller session not found.",
    };
  }

  return { available: true, session: adminView(data as SessionRow) };
}

export async function markControllerShock(bundleId: string, sessionId?: string | null) {
  if (!sessionId) return;

  await supabaseAdmin
    .from(CONTROLLER_SESSIONS_TABLE)
    .update({ last_shock_at: new Date().toISOString() })
    .eq("bundle_id", bundleId)
    .eq("session_id", sessionId);
}

export function getShockCooldownError(policy: ControllerSessionPolicy): string | null {
  if (policy.remainingShockCooldownSeconds <= 0) return null;

  return `Shock is on cooldown for this controller. Try again in ${policy.remainingShockCooldownSeconds}s.`;
}
