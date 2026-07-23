"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

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

type ManagedLink = {
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
  maxDurationSeconds: number;

  vibrateIntensityLimit: number;
  vibrateDurationLimitSeconds: number;

  shockIntensityLimit: number;
  shockDurationLimitSeconds: number;

  // Legacy fallback fields for old saved bundles.
  intensityLimit?: number;
  durationLimitSeconds?: number;

  forceLogin: boolean;
  forceWarning: boolean;
  forceWarningLevel: number;
  disabled: boolean;
  requiresSpecialPermissions: boolean;
  paused: boolean;
  activateOnLoad: boolean;

  remainingActivations: number;
  expiry: string | null;
  lastCheckedAt: string;
};

type BundleData = {
  id: string;
  title: string;
  links: ManagedLink[];
  disabled: boolean;
  created_at: string;
  expires_at: string | null;
  hasAccessPassword?: boolean;
  hasSpecialPermissionsPassword?: boolean;
};

type ControllerSession = {
  sessionId: string;
  username: string;
  blocked: boolean;
  shockCooldownSeconds: number;
  remainingShockCooldownSeconds: number;
  lastShockAt: string | null;
  connectedAt: string;
  lastSeenAt: string;
};

type Props = {
  bundleId: string;
  token: string;
};

function extractPiShockLinkId(input: string): string {
  const trimmed = input.trim();

  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  if (uuidRegex.test(trimmed)) {
    return trimmed;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Please enter a valid PiShock LinkControl URL.");
  }

  if (url.hostname !== "pishock.com" && url.hostname !== "www.pishock.com") {
    throw new Error("Only pishock.com links are allowed.");
  }

  if (!url.hash.startsWith("#/LinkControl")) {
    throw new Error("The link must be a PiShock LinkControl link.");
  }

  const hashUrl = new URL(url.hash.slice(1), "https://pishock.com");
  const id = hashUrl.searchParams.get("id");

  if (!id || !uuidRegex.test(id)) {
    throw new Error("No valid LinkControl ID was found in this link.");
  }

  return id;
}

function createPiShockUrl(uuid: string): string {
  return `https://pishock.com/#/LinkControl?id=${uuid}`;
}

function clamp(value: number, min: number, max: number): number {
  const safeValue = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(safeValue, max));
}

function numberOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSeconds(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}s`;
}

function normalizeWarningLevel(value: unknown): number {
  return clamp(Math.round(numberOrFallback(value, 1)), 1, 3);
}

function normalizeLink(
  input: Partial<ManagedLink> & { uuid: string },
): ManagedLink {
  const maxIntensity = clamp(numberOrFallback(input.maxIntensity, 100), 0, 100);
  const maxDuration = Math.max(100, numberOrFallback(input.maxDuration, 1000));

  const maxDurationSeconds = Math.max(
    0.1,
    numberOrFallback(input.maxDurationSeconds, Math.floor(maxDuration / 1000)),
  );

  const legacyIntensityLimit = input.intensityLimit;
  const legacyDurationLimitSeconds = input.durationLimitSeconds;

  return {
    name: String(input.name ?? "Unnamed shocker"),
    uuid: input.uuid,
    url: input.url ?? createPiShockUrl(input.uuid),

    pishockName: String(input.pishockName ?? "Unknown"),
    linkId: numberOrFallback(input.linkId, 0),
    ownerId: numberOrFallback(input.ownerId, 0),

    shockEnabled: Boolean(input.shockEnabled),
    vibrateEnabled: Boolean(input.vibrateEnabled),
    beepEnabled: Boolean(input.beepEnabled),

    maxIntensity,
    maxDuration,
    maxDurationSeconds,

    vibrateIntensityLimit: clamp(
      numberOrFallback(
        input.vibrateIntensityLimit ?? legacyIntensityLimit,
        maxIntensity,
      ),
      0,
      maxIntensity,
    ),

    vibrateDurationLimitSeconds: clamp(
      numberOrFallback(
        input.vibrateDurationLimitSeconds ?? legacyDurationLimitSeconds,
        maxDurationSeconds,
      ),
      0.1,
      maxDurationSeconds,
    ),

    shockIntensityLimit: clamp(
      numberOrFallback(
        input.shockIntensityLimit ?? legacyIntensityLimit,
        maxIntensity,
      ),
      0,
      maxIntensity,
    ),

    shockDurationLimitSeconds: clamp(
      numberOrFallback(
        input.shockDurationLimitSeconds ?? legacyDurationLimitSeconds,
        maxDurationSeconds,
      ),
      0.1,
      maxDurationSeconds,
    ),

    forceLogin: Boolean(input.forceLogin),
    forceWarning: Boolean(input.forceWarning),
    forceWarningLevel: normalizeWarningLevel(input.forceWarningLevel),
    disabled: Boolean(input.disabled),
    requiresSpecialPermissions: Boolean(input.requiresSpecialPermissions),
    paused: Boolean(input.paused),
    activateOnLoad: Boolean(input.activateOnLoad),

    remainingActivations: numberOrFallback(input.remainingActivations, -1),
    expiry: input.expiry ?? null,
    lastCheckedAt: String(input.lastCheckedAt ?? new Date().toISOString()),
  };
}

function linkFromPiShockInfo(
  uuid: string,
  customName: string,
  info: PiShockLinkInfo,
): ManagedLink {
  const maxDurationSeconds = Math.max(0.1, Math.floor(info.MaxDuration / 1000));

  return {
    name: customName.trim() || info.Name || "New shocker",
    uuid,
    url: createPiShockUrl(uuid),

    pishockName: info.Name,
    linkId: info.LinkId,
    ownerId: info.OwnerId,

    shockEnabled: info.ShockEnabled,
    vibrateEnabled: info.VibrateEnabled,
    beepEnabled: info.BeepEnabled,

    maxIntensity: info.MaxIntensity,
    maxDuration: info.MaxDuration,
    maxDurationSeconds,

    vibrateIntensityLimit: info.MaxIntensity,
    vibrateDurationLimitSeconds: maxDurationSeconds,

    shockIntensityLimit: info.MaxIntensity,
    shockDurationLimitSeconds: maxDurationSeconds,

    forceLogin: info.ForceLogin,
    forceWarning: Boolean(info.ForceWarning),
    forceWarningLevel: 1,
    disabled: false,
    requiresSpecialPermissions: false,
    paused: info.Paused,
    activateOnLoad: info.ActivateOnLoad,

    remainingActivations: info.RemainingActivations,
    expiry: info.Expiry,
    lastCheckedAt: new Date().toISOString(),
  };
}

function buildSaveStateSnapshot(
  title: string,
  disabled: boolean,
  links: ManagedLink[],
  newAccessPassword: string,
  clearAccessPassword: boolean,
  newSpecialPermissionsPassword: string,
  clearSpecialPermissionsPassword: boolean,
): string {
  return JSON.stringify({
    title,
    disabled,
    accessPassword: newAccessPassword.trim(),
    clearAccessPassword,
    specialPermissionsPassword: newSpecialPermissionsPassword.trim(),
    clearSpecialPermissionsPassword,
    links: links.map((link) => ({
      name: link.name,
      uuid: link.uuid,
      vibrateIntensityLimit: link.vibrateIntensityLimit,
      vibrateDurationLimitSeconds: link.vibrateDurationLimitSeconds,
      shockIntensityLimit: link.shockIntensityLimit,
      shockDurationLimitSeconds: link.shockDurationLimitSeconds,
      forceWarning: link.forceWarning,
      forceWarningLevel: link.forceWarningLevel,
      disabled: link.disabled,
      requiresSpecialPermissions: link.requiresSpecialPermissions,
    })),
  });
}

export function ManageBundleEditor({ bundleId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [links, setLinks] = useState<ManagedLink[]>([]);

  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkInput, setNewLinkInput] = useState("");

  const [hasAccessPassword, setHasAccessPassword] = useState(false);
  const [newAccessPassword, setNewAccessPassword] = useState("");
  const [clearAccessPassword, setClearAccessPassword] = useState(false);

  const [hasSpecialPermissionsPassword, setHasSpecialPermissionsPassword] =
    useState(false);
  const [newSpecialPermissionsPassword, setNewSpecialPermissionsPassword] =
    useState("");
  const [clearSpecialPermissionsPassword, setClearSpecialPermissionsPassword] =
    useState(false);

  const [controllersOpen, setControllersOpen] = useState(false);
  const [controllersLoading, setControllersLoading] = useState(false);
  const [controllersError, setControllersError] = useState<string | null>(null);
  const [controllersSetupSql, setControllersSetupSql] = useState<string | null>(
    null,
  );
  const [controllers, setControllers] = useState<ControllerSession[]>([]);
  const [controllerCooldownDrafts, setControllerCooldownDrafts] = useState<
    Record<string, string>
  >({});
  const [updatingControllerId, setUpdatingControllerId] = useState<
    string | null
  >(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return `/c/${bundleId}`;
    return `${window.location.origin}/c/${bundleId}`;
  }, [bundleId]);

  const currentSnapshot = useMemo(
    () =>
      buildSaveStateSnapshot(
        title,
        disabled,
        links,
        newAccessPassword,
        clearAccessPassword,
        newSpecialPermissionsPassword,
        clearSpecialPermissionsPassword,
      ),
    [
      title,
      disabled,
      links,
      newAccessPassword,
      clearAccessPassword,
      newSpecialPermissionsPassword,
      clearSpecialPermissionsPassword,
    ],
  );

  const hasUnsavedChanges =
    !loading && savedSnapshot !== null && currentSnapshot !== savedSnapshot;

  useEffect(() => {
    const cleanTitle = title.trim();

    document.title = cleanTitle
      ? `${cleanTitle} Management | PiShock Bundle Links`
      : "Manage PiShock Bundle | PiShock Bundle Links";
  }, [title]);

  useEffect(() => {
    async function loadBundle() {
      setLoading(true);
      setError(null);

      try {
        if (!token) {
          throw new Error("Missing creator token.");
        }

        const response = await fetch(
          `/api/bundles/${bundleId}/manage?token=${encodeURIComponent(token)}`,
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load bundle.");
        }

        const bundle = result as BundleData;

        const loadedTitle = String(bundle.title ?? "");
        const loadedDisabled = Boolean(bundle.disabled);
        const loadedLinks = (bundle.links ?? []).map((link) =>
          normalizeLink(link),
        );

        setTitle(loadedTitle);
        setDisabled(loadedDisabled);
        setLinks(loadedLinks);
        setHasAccessPassword(Boolean(bundle.hasAccessPassword));
        setNewAccessPassword("");
        setClearAccessPassword(false);
        setHasSpecialPermissionsPassword(
          Boolean(bundle.hasSpecialPermissionsPassword),
        );
        setNewSpecialPermissionsPassword("");
        setClearSpecialPermissionsPassword(false);
        setSavedSnapshot(
          buildSaveStateSnapshot(
            loadedTitle,
            loadedDisabled,
            loadedLinks,
            "",
            false,
            "",
            false,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error.");
      } finally {
        setLoading(false);
      }
    }

    loadBundle();
  }, [bundleId, token]);

  useEffect(() => {
    if (!controllersOpen) return;

    loadControllers(true);
    const intervalId = window.setInterval(() => loadControllers(true), 5000);

    return () => window.clearInterval(intervalId);
  }, [controllersOpen, bundleId, token]);

  function updateLink(uuid: string, patch: Partial<ManagedLink>) {
    setLinks((current) =>
      current.map((link) =>
        link.uuid === uuid ? normalizeLink({ ...link, ...patch }) : link,
      ),
    );
  }

  function removeLink(uuid: string) {
    setLinks((current) => current.filter((link) => link.uuid !== uuid));
  }

  async function addLink() {
    setError(null);
    setMessage(null);

    try {
      if (links.length >= 10) {
        throw new Error("A bundle can contain at most 10 shockers.");
      }

      const uuid = extractPiShockLinkId(newLinkInput);

      if (
        links.some((link) => link.uuid.toLowerCase() === uuid.toLowerCase())
      ) {
        throw new Error("This PiShock link is already in the bundle.");
      }

      const response = await fetch(`https://api.pishock.com/Links/${uuid}`);

      if (!response.ok) {
        throw new Error(`PiShock API error: ${response.status}`);
      }

      const info = (await response.json()) as PiShockLinkInfo;
      const newLink = linkFromPiShockInfo(uuid, newLinkName, info);

      setLinks((current) => [...current, newLink]);
      setNewLinkInput("");
      setNewLinkName("");
      setMessage("Shocker added. Save changes to publish this update.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    }
  }

  function patchControllerLocal(
    sessionId: string,
    patch: Partial<ControllerSession>,
  ) {
    setControllers((current) =>
      current.map((controller) =>
        controller.sessionId === sessionId
          ? { ...controller, ...patch }
          : controller,
      ),
    );
  }

  async function loadControllers(silent = false) {
    if (!token) return;

    if (!silent) {
      setControllersLoading(true);
    }

    setControllersError(null);
    setControllersSetupSql(null);

    try {
      const response = await fetch(
        `/api/bundles/${bundleId}/controllers?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.setupSql) {
          setControllersSetupSql(String(result.setupSql));
        }

        throw new Error(
          result.error || "Could not load connected controllers.",
        );
      }

      const sessions = (result.sessions ?? []) as ControllerSession[];
      setControllers(sessions);
      setControllerCooldownDrafts((current) => {
        const activeSessionIds = new Set(
          sessions.map((session) => session.sessionId),
        );
        return Object.fromEntries(
          Object.entries(current).filter(([sessionId]) =>
            activeSessionIds.has(sessionId),
          ),
        );
      });
    } catch (err) {
      setControllersError(
        err instanceof Error ? err.message : "Unknown error.",
      );
    } finally {
      if (!silent) {
        setControllersLoading(false);
      }
    }
  }

  function setControllerCooldownDraft(sessionId: string, value: string) {
    setControllerCooldownDrafts((current) => ({
      ...current,
      [sessionId]: value,
    }));
  }

  function getControllerCooldownDraft(controller: ControllerSession): string {
    return (
      controllerCooldownDrafts[controller.sessionId] ??
      String(controller.shockCooldownSeconds)
    );
  }

  async function saveControllerCooldown(controller: ControllerSession) {
    const rawValue = getControllerCooldownDraft(controller).trim();
    const parsedValue = Number(rawValue);

    if (!rawValue || !Number.isFinite(parsedValue)) {
      setControllersError("Please enter a valid cooldown in seconds.");
      return;
    }

    await updateController(controller.sessionId, {
      shockCooldownSeconds: clamp(Math.round(parsedValue), 0, 3600),
    });
  }

  async function updateController(
    sessionId: string,
    patch: Partial<ControllerSession>,
  ) {
    setUpdatingControllerId(sessionId);
    setControllersError(null);
    setControllersSetupSql(null);

    try {
      const response = await fetch(
        `/api/bundles/${bundleId}/controllers/${encodeURIComponent(sessionId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            blocked: patch.blocked,
            shockCooldownSeconds:
              typeof patch.shockCooldownSeconds === "number"
                ? Math.max(
                    0,
                    Math.min(3600, Math.round(patch.shockCooldownSeconds)),
                  )
                : undefined,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        if (result.setupSql) {
          setControllersSetupSql(String(result.setupSql));
        }

        throw new Error(result.error || "Could not update controller.");
      }

      if (result.session) {
        patchControllerLocal(sessionId, result.session as ControllerSession);

        if (typeof patch.shockCooldownSeconds === "number") {
          setControllerCooldownDrafts((current) => {
            const { [sessionId]: _savedDraft, ...remainingDrafts } = current;
            void _savedDraft;
            return remainingDrafts;
          });
        }
      }
    } catch (err) {
      setControllersError(
        err instanceof Error ? err.message : "Unknown error.",
      );
    } finally {
      setUpdatingControllerId(null);
    }
  }

  async function saveChanges() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!token) {
        throw new Error("Missing creator token.");
      }

      if (links.length === 0) {
        throw new Error("A bundle must contain at least one shocker.");
      }

      if (
        newSpecialPermissionsPassword.trim() &&
        newSpecialPermissionsPassword.trim().length < 8
      ) {
        throw new Error(
          "The special permissions password must contain at least 8 characters.",
        );
      }

      const protectedLinksExist = links.some(
        (link) => link.requiresSpecialPermissions,
      );
      const specialPasswordWillExist =
        !clearSpecialPermissionsPassword &&
        (Boolean(newSpecialPermissionsPassword.trim()) ||
          hasSpecialPermissionsPassword);

      if (protectedLinksExist && !specialPasswordWillExist) {
        throw new Error(
          "Set a special permissions password before protecting shockers.",
        );
      }

      const response = await fetch(`/api/bundles/${bundleId}/manage`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          title,
          disabled,
          accessPassword: newAccessPassword.trim() || undefined,
          clearAccessPassword,
          specialPermissionsPassword:
            newSpecialPermissionsPassword.trim() || undefined,
          clearSpecialPermissionsPassword,
          links: links.map((link) => ({
            name: link.name,
            uuid: link.uuid,

            vibrateIntensityLimit: link.vibrateIntensityLimit,
            vibrateDurationLimitSeconds: link.vibrateDurationLimitSeconds,

            shockIntensityLimit: link.shockIntensityLimit,
            shockDurationLimitSeconds: link.shockDurationLimitSeconds,

            forceWarning: link.forceWarning,
            forceWarningLevel: link.forceWarningLevel,
            disabled: link.disabled,
            requiresSpecialPermissions: link.requiresSpecialPermissions,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save bundle.");
      }

      if (clearAccessPassword) {
        setHasAccessPassword(false);
      } else if (newAccessPassword.trim()) {
        setHasAccessPassword(true);
      }

      if (clearSpecialPermissionsPassword) {
        setHasSpecialPermissionsPassword(false);
      } else if (newSpecialPermissionsPassword.trim()) {
        setHasSpecialPermissionsPassword(true);
      }

      setSavedSnapshot(
        buildSaveStateSnapshot(
          title,
          disabled,
          links,
          "",
          false,
          "",
          false,
        ),
      );
      setNewAccessPassword("");
      setClearAccessPassword(false);
      setNewSpecialPermissionsPassword("");
      setClearSpecialPermissionsPassword(false);
      setMessage("Changes saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            Loading creator page...
          </div>
        </div>
      </main>
    );
  }

  if (error && links.length === 0) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="rounded-2xl border border-red-800 bg-red-950 p-6 text-red-100">
            {error}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-24 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h1 className="text-3xl font-bold">Manage bundle</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Edit the public control page, manage shockers, and set separate
            vibrate/shock limits.
          </p>

          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block break-all font-mono text-sm text-blue-300 underline"
          >
            {publicUrl}
          </a>
        </header>

        {message && (
          <div className="mt-6 rounded-xl border border-green-800 bg-green-950 p-4 text-sm text-green-100">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-800 bg-red-950 p-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Bundle settings</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Bundle title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="font-medium">Access password</h3>

              <p className="mt-1 text-sm text-zinc-500">
                Current status:{" "}
                {hasAccessPassword ? "Password protected" : "Name only"}
              </p>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">
                    New access password
                  </span>
                  <input
                    type="password"
                    value={newAccessPassword}
                    onChange={(event) =>
                      setNewAccessPassword(event.target.value)
                    }
                    placeholder="Leave empty to keep current password"
                    disabled={clearAccessPassword}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={clearAccessPassword}
                    onChange={(event) =>
                      setClearAccessPassword(event.target.checked)
                    }
                  />
                  <span>Remove access password and require name only</span>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-purple-800 bg-zinc-950 p-4">
              <h3 className="font-medium text-purple-200">
                Special permissions password
              </h3>

              <p className="mt-1 text-sm text-zinc-500">
                Current status:{" "}
                {hasSpecialPermissionsPassword
                  ? "Special password configured"
                  : "No special password"}
              </p>

              <p className="mt-2 text-sm text-zinc-400">
                This password is separate from the public page access password.
                Shockers marked as requiring special permissions stay locked
                until a user enters it.
              </p>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">
                    New special permissions password
                  </span>
                  <input
                    type="password"
                    value={newSpecialPermissionsPassword}
                    onChange={(event) =>
                      setNewSpecialPermissionsPassword(event.target.value)
                    }
                    placeholder="Leave empty to keep current password"
                    disabled={clearSpecialPermissionsPassword}
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </label>

                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={clearSpecialPermissionsPassword}
                    onChange={(event) =>
                      setClearSpecialPermissionsPassword(event.target.checked)
                    }
                  />
                  <span>Remove special permissions password</span>
                </label>

                {clearSpecialPermissionsPassword &&
                  links.some((link) => link.requiresSpecialPermissions) && (
                    <p className="text-sm text-yellow-200">
                      Disable “Needs special permissions” on all shockers before
                      removing this password.
                    </p>
                  )}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <input
                type="checkbox"
                checked={disabled}
                onChange={(event) => setDisabled(event.target.checked)}
              />

              <div>
                <div className="font-medium">Take public page offline</div>
                <div className="text-sm text-zinc-500">
                  When enabled, the public control page will no longer be
                  available.
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">Live controllers</h2>
              <p className="mt-1 text-sm text-zinc-400">
                See users who are currently connected, block or re-enable their
                inputs, and set a per-user shock cooldown.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextOpen = !controllersOpen;
                setControllersOpen(nextOpen);

                if (nextOpen) {
                  void loadControllers(false);
                }
              }}
              className="rounded-lg border border-blue-500/60 px-4 py-2 text-sm font-semibold text-blue-200 hover:bg-blue-950"
            >
              {controllersOpen
                ? "Hide connected users"
                : "Show connected users"}
            </button>
          </div>

          {controllersOpen && (
            <div className="mt-5 grid gap-4">
              {controllersLoading && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
                  Loading connected users...
                </div>
              )}

              {controllersError && (
                <div className="rounded-xl border border-yellow-800 bg-yellow-950 p-4 text-sm text-yellow-100">
                  <p>{controllersError}</p>

                  {controllersSetupSql && (
                    <details className="mt-3">
                      <summary className="cursor-pointer font-medium">
                        Show Supabase setup SQL
                      </summary>
                      <pre className="mt-3 overflow-x-auto rounded-lg border border-yellow-800 bg-zinc-950 p-3 text-xs text-zinc-100">
                        {controllersSetupSql}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {!controllersLoading &&
                !controllersError &&
                controllers.length === 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
                    No one is actively connected right now. Users appear here
                    after they enter the public control page.
                  </div>
                )}

              {controllers.map((controller) => (
                <article
                  key={controller.sessionId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{controller.username}</h3>
                        {controller.blocked ? (
                          <Badge variant="danger">Blocked</Badge>
                        ) : (
                          <Badge variant="success">Inputs enabled</Badge>
                        )}
                      </div>

                      <p className="mt-1 text-xs text-zinc-500">
                        Last seen{" "}
                        {new Date(controller.lastSeenAt).toLocaleTimeString()} ·
                        Session {controller.sessionId.slice(0, 8)}
                      </p>

                      {controller.lastShockAt && (
                        <p className="mt-1 text-xs text-zinc-500">
                          Last shock{" "}
                          {new Date(
                            controller.lastShockAt,
                          ).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                      <button
                        type="button"
                        onClick={() =>
                          updateController(controller.sessionId, {
                            blocked: !controller.blocked,
                          })
                        }
                        disabled={updatingControllerId === controller.sessionId}
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {controller.blocked ? "Enable inputs" : "Block inputs"}
                      </button>

                      <label className="grid gap-2 text-sm">
                        <span className="text-zinc-300">
                          Shock cooldown seconds
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={getControllerCooldownDraft(controller)}
                          onChange={(event) =>
                            setControllerCooldownDraft(
                              controller.sessionId,
                              event.target.value,
                            )
                          }
                          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => saveControllerCooldown(controller)}
                        disabled={updatingControllerId === controller.sessionId}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save limit
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Add shocker</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_2fr_auto]">
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Display name</span>
              <input
                value={newLinkName}
                onChange={(event) => setNewLinkName(event.target.value)}
                placeholder="Left arm"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">
                PiShock LinkControl URL
              </span>
              <input
                value={newLinkInput}
                onChange={(event) => setNewLinkInput(event.target.value)}
                placeholder="https://pishock.com/#/LinkControl?id=..."
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="flex items-end">
              <button
                onClick={addLink}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500"
              >
                Add
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Shockers</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {links.length} of 10 shockers configured
              </p>
            </div>

            <button
              onClick={saveChanges}
              disabled={saving}
              className="rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>

          {links.map((link) => (
            <article
              key={link.uuid}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{link.name}</h3>

                    {link.disabled ? (
                      <Badge variant="danger">Disabled</Badge>
                    ) : link.paused ? (
                      <Badge variant="danger">Paused</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}

                    {link.forceLogin && (
                      <Badge variant="warning">Force login</Badge>
                    )}
                    {link.requiresSpecialPermissions && (
                      <Badge variant="warning">Special permissions</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-zinc-400">
                    Official name: {link.pishockName}
                  </p>

                  <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                    {link.uuid}
                  </p>

                  {link.disabled && (
                    <p className="mt-2 text-sm text-yellow-200">
                      Disabled shockers stay visible on the user page, but all
                      commands for this shocker are blocked after saving.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateLink(link.uuid, { disabled: !link.disabled })
                    }
                    className={
                      link.disabled
                        ? "rounded-lg border border-green-700 px-4 py-2 text-sm font-medium text-green-200 hover:bg-green-950"
                        : "rounded-lg border border-yellow-700 px-4 py-2 text-sm font-medium text-yellow-200 hover:bg-yellow-950"
                    }
                  >
                    {link.disabled ? "Enable shocker" : "Disable shocker"}
                  </button>

                  <button
                    onClick={() => removeLink(link.uuid)}
                    disabled={links.length <= 1}
                    className="rounded-lg border border-red-800 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Display name</span>
                  <input
                    value={link.name}
                    onChange={(event) =>
                      updateLink(link.uuid, { name: event.target.value })
                    }
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </label>

                <div className="grid gap-4 lg:grid-cols-2">
                  <LimitPanel
                    title="Vibrate limits"
                    tone="default"
                    maxIntensity={link.maxIntensity}
                    maxDurationSeconds={link.maxDurationSeconds}
                    intensityValue={link.vibrateIntensityLimit}
                    durationValue={link.vibrateDurationLimitSeconds}
                    onIntensityChange={(value) =>
                      updateLink(link.uuid, {
                        vibrateIntensityLimit: value,
                      })
                    }
                    onDurationChange={(value) =>
                      updateLink(link.uuid, {
                        vibrateDurationLimitSeconds: value,
                      })
                    }
                  />

                  <LimitPanel
                    title="Shock limits"
                    tone="danger"
                    maxIntensity={link.maxIntensity}
                    maxDurationSeconds={link.maxDurationSeconds}
                    intensityValue={link.shockIntensityLimit}
                    durationValue={link.shockDurationLimitSeconds}
                    onIntensityChange={(value) =>
                      updateLink(link.uuid, {
                        shockIntensityLimit: value,
                      })
                    }
                    onDurationChange={(value) =>
                      updateLink(link.uuid, {
                        shockDurationLimitSeconds: value,
                      })
                    }
                  />
                </div>

                <ForceWarningPanel
                  enabled={link.forceWarning}
                  warningLevel={link.forceWarningLevel}
                  onEnabledChange={(value) =>
                    updateLink(link.uuid, {
                      forceWarning: value,
                    })
                  }
                  onWarningLevelChange={(value) =>
                    updateLink(link.uuid, {
                      forceWarningLevel: normalizeWarningLevel(value),
                    })
                  }
                />

                <label className="flex items-start gap-3 rounded-xl border border-purple-800 bg-zinc-950 p-4">
                  <input
                    type="checkbox"
                    checked={link.requiresSpecialPermissions}
                    onChange={(event) =>
                      updateLink(link.uuid, {
                        requiresSpecialPermissions: event.target.checked,
                      })
                    }
                    className="mt-1"
                  />

                  <div>
                    <div className="font-medium text-purple-200">
                      Needs special permissions
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      Users can see this shocker, but shock and vibrate remain
                      locked until the separate special permissions password is
                      entered. Stop remains available.
                    </div>
                  </div>
                </label>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <InfoBox
                  label="Shock"
                  value={link.shockEnabled ? "Allowed" : "Off"}
                />
                <InfoBox
                  label="Vibrate"
                  value={link.vibrateEnabled ? "Allowed" : "Off"}
                />
                <InfoBox
                  label="Beep"
                  value={link.beepEnabled ? "Allowed" : "Off"}
                />
                <InfoBox
                  label="Forced warning"
                  value={
                    link.forceWarning
                      ? `Level ${link.forceWarningLevel}`
                      : "Off"
                  }
                />
                <InfoBox
                  label="Special permissions"
                  value={link.requiresSpecialPermissions ? "Required" : "Off"}
                />
                <InfoBox
                  label="Manager status"
                  value={link.disabled ? "Disabled" : "Enabled"}
                />
                <InfoBox
                  label="Remaining"
                  value={
                    link.remainingActivations === -1
                      ? "Unlimited"
                      : link.remainingActivations
                  }
                />
              </div>
            </article>
          ))}
        </section>
      </div>

      {hasUnsavedChanges && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-full border border-yellow-700/70 bg-zinc-900/95 px-4 py-3 text-sm text-yellow-100 shadow-2xl shadow-black/40 backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              Don’t forget to save your changes.
            </span>

            <button
              type="button"
              onClick={saveChanges}
              disabled={saving}
              className="shrink-0 rounded-full bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ForceWarningPanel({
  enabled,
  warningLevel,
  onEnabledChange,
  onWarningLevelChange,
}: {
  enabled: boolean;
  warningLevel: number;
  onEnabledChange: (value: boolean) => void;
  onWarningLevelChange: (value: number) => void;
}) {
  const safeWarningLevel = normalizeWarningLevel(warningLevel);

  return (
    <section className="rounded-xl border border-yellow-800 bg-zinc-950 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-semibold text-yellow-200">
            Forced shock warning
          </h4>
          <p className="mt-1 text-sm text-zinc-400">
            When enabled, users see the selected warning duration and every shock
            command uses it.
          </p>
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          <span>Enable</span>
        </label>
      </div>

      {enabled && (
        <label className="mt-4 grid gap-2 text-sm">
          <span className="text-zinc-300">Warning duration shown to users</span>
          <select
            value={safeWarningLevel}
            onChange={(event) =>
              onWarningLevelChange(Number(event.target.value))
            }
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
          >
            <option value={1}>Short</option>
            <option value={2}>Medium</option>
            <option value={3}>Long</option>
          </select>
        </label>
      )}
    </section>
  );
}

function LimitPanel({
  title,
  tone,
  maxIntensity,
  maxDurationSeconds,
  intensityValue,
  durationValue,
  onIntensityChange,
  onDurationChange,
}: {
  title: string;
  tone: "default" | "danger";
  maxIntensity: number;
  maxDurationSeconds: number;
  intensityValue: number;
  durationValue: number;
  onIntensityChange: (value: number) => void;
  onDurationChange: (value: number) => void;
}) {
  const borderClass = tone === "danger" ? "border-red-900" : "border-zinc-800";
  const titleClass = tone === "danger" ? "text-red-200" : "";

  const safeMaxIntensity = Math.max(0, maxIntensity);
  const safeMaxDurationSeconds = Math.max(0.1, maxDurationSeconds);

  const safeIntensityValue = clamp(intensityValue, 0, safeMaxIntensity);
  const safeDurationValue = clamp(durationValue, 0.1, safeMaxDurationSeconds);

  return (
    <section className={`rounded-xl border ${borderClass} bg-zinc-950 p-4`}>
      <h4 className={`font-semibold ${titleClass}`}>{title}</h4>

      <div className="mt-4 grid gap-5">
        <label className="grid gap-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-zinc-300">Intensity limit</span>
            <span className="whitespace-nowrap font-mono">
              {safeIntensityValue} / {safeMaxIntensity}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={safeMaxIntensity}
            value={safeIntensityValue}
            onChange={(event) => onIntensityChange(Number(event.target.value))}
          />

          <input
            type="number"
            min={0}
            max={safeMaxIntensity}
            value={String(safeIntensityValue)}
            onChange={(event) =>
              onIntensityChange(
                clamp(Number(event.target.value), 0, safeMaxIntensity),
              )
            }
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>

        <label className="grid gap-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-zinc-300">Duration limit</span>
            <span className="whitespace-nowrap font-mono">
              {formatSeconds(safeDurationValue)} /{" "}
              {formatSeconds(safeMaxDurationSeconds)}
            </span>
          </div>

          <input
            type="range"
            min={0.1}
            max={safeMaxDurationSeconds}
            step={0.1}
            value={safeDurationValue}
            onChange={(event) => onDurationChange(Number(event.target.value))}
          />

          <input
            type="number"
            min={0.1}
            max={safeMaxDurationSeconds}
            step={0.1}
            value={String(safeDurationValue)}
            onChange={(event) =>
              onDurationChange(
                clamp(Number(event.target.value), 0.1, safeMaxDurationSeconds),
              )
            }
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
      </div>
    </section>
  );
}

function InfoBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function Badge({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "success" | "warning" | "danger";
}) {
  const className =
    variant === "success"
      ? "border-green-800 bg-green-950 text-green-200"
      : variant === "warning"
        ? "border-yellow-800 bg-yellow-950 text-yellow-200"
        : "border-red-800 bg-red-950 text-red-200";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}
