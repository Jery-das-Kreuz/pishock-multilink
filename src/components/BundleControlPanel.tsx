"use client";

import { useEffect, useMemo, useState } from "react";
import { LinkControlCard } from "@/components/LinkControlCard";

type StoredLink = {
  id: string;
  name: string;

  shockEnabled: boolean;
  vibrateEnabled: boolean;

  vibrateIntensityLimit: number;
  vibrateDurationLimitSeconds: number;
  shockIntensityLimit: number;
  shockDurationLimitSeconds: number;

  forceLogin: boolean;
  forceWarning?: boolean;
  forceWarningLevel?: number;
  disabled?: boolean;
  requiresSpecialPermissions?: boolean;
  paused: boolean;
};

type Props = {
  bundleId: string;
  initialTitle: string;
  links: StoredLink[];
  requiresPassword: boolean;
  initialDisabled: boolean;
};

type CommandMode = "s" | "v" | "e";

type ControllerPolicy = {
  blocked: boolean;
  shockCooldownSeconds: number;
  remainingShockCooldownSeconds: number;
  lastShockAt: string | null;
};

function normalizeWarningLevel(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function createLocalSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getShockCooldownRemaining(policy: ControllerPolicy | null): number {
  if (!policy || policy.shockCooldownSeconds <= 0 || !policy.lastShockAt) {
    return 0;
  }

  const lastShockAt = new Date(policy.lastShockAt).getTime();
  if (!Number.isFinite(lastShockAt)) return 0;

  const elapsedSeconds = (Date.now() - lastShockAt) / 1000;
  return Math.max(0, Math.ceil(policy.shockCooldownSeconds - elapsedSeconds));
}

export function BundleControlPanel({
  bundleId,
  initialTitle,
  links: initialLinks,
  requiresPassword,
  initialDisabled,
}: Props) {
  const [bundleTitle, setBundleTitle] = useState(initialTitle);
  const [links, setLinks] = useState<StoredLink[]>(initialLinks);
  const [bundleDisabled, setBundleDisabled] = useState(initialDisabled);
  const [username, setUsername] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [specialPermissionsPassword, setSpecialPermissionsPassword] =
    useState("");
  const [specialPermissionsGranted, setSpecialPermissionsGranted] =
    useState(false);
  const [specialPermissionsError, setSpecialPermissionsError] = useState<
    string | null
  >(null);
  const [checkingSpecialPermissions, setCheckingSpecialPermissions] =
    useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [controllerPolicy, setControllerPolicy] =
    useState<ControllerPolicy | null>(null);
  const [controllerTrackingWarning, setControllerTrackingWarning] = useState<
    string | null
  >(null);
  const [nowTick, setNowTick] = useState(0);

  const [groupVibrateIntensity, setGroupVibrateIntensity] = useState(10);
  const [groupVibrateDuration, setGroupVibrateDuration] = useState(1);

  const [groupShockIntensity, setGroupShockIntensity] = useState(5);
  const [groupShockDuration, setGroupShockDuration] = useState(0.3);
  const [groupShockWarning, setGroupShockWarning] = useState(false);
  const [groupShockWarningLevel, setGroupShockWarningLevel] = useState(1);

  const [groupLoading, setGroupLoading] = useState<CommandMode | null>(null);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);

  useEffect(() => {
    const cleanTitle = bundleTitle.trim();

    document.title = cleanTitle ? `${cleanTitle} Control` : "Bundle Control";
  }, [bundleTitle]);

  useEffect(() => {
    const storageKey = `pishock-controller-id:${bundleId}`;

    try {
      const existing = window.localStorage.getItem(storageKey);
      const controllerId =
        existing && existing.length >= 8 && existing.length <= 120
          ? existing
          : createLocalSessionId();

      window.localStorage.setItem(storageKey, controllerId);
      setSessionId(controllerId);
    } catch {
      setSessionId(createLocalSessionId());
    }
  }, [bundleId]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setNowTick((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!accessGranted || !username.trim() || !sessionId || bundleDisabled)
      return;

    let active = true;

    async function sendPresence() {
      try {
        const response = await fetch(
          `/api/bundles/${bundleId}/controllers/presence`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              username: username.trim(),
              accessPassword,
            }),
          },
        );

        const result = await response.json();

        if (!active) return;

        if (!response.ok || !result.ok) {
          setControllerTrackingWarning(
            result.error || "Could not update controller presence.",
          );
          return;
        }

        setControllerTrackingWarning(result.warning ?? null);

        if (result.policy) {
          setControllerPolicy(result.policy as ControllerPolicy);
        }
      } catch {
        if (active) {
          setControllerTrackingWarning("Could not update controller presence.");
        }
      }
    }

    sendPresence();
    const intervalId = window.setInterval(sendPresence, 5000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    accessGranted,
    username,
    accessPassword,
    sessionId,
    bundleDisabled,
    bundleId,
  ]);

  useEffect(() => {
    let active = true;

    async function refreshBundleStatus() {
      try {
        const response = await fetch(`/api/bundles/${bundleId}`, {
          cache: "no-store",
        });

        if (!active) return;

        if (!response.ok) {
          setBundleDisabled(true);
          return;
        }

        const result = await response.json();

        if (typeof result.title === "string" && result.title.trim()) {
          setBundleTitle(result.title);
        }

        if (Array.isArray(result.links)) {
          setLinks(result.links as StoredLink[]);
        }

        setBundleDisabled(Boolean(result.disabled));
      } catch {
        if (active) {
          setBundleDisabled(true);
        }
      }
    }

    refreshBundleStatus();
    const intervalId = window.setInterval(refreshBundleStatus, 3000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [bundleId]);

  async function unlockAccess() {
    setAccessError(null);
    setCheckingAccess(true);

    try {
      if (!username.trim()) {
        throw new Error("Please enter a display name.");
      }

      if (requiresPassword && !accessPassword.trim()) {
        throw new Error("Please enter the access password.");
      }

      const response = await fetch(`/api/bundles/${bundleId}/access`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password: accessPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Access denied.");
      }

      setAccessGranted(true);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setCheckingAccess(false);
    }
  }

  async function unlockSpecialPermissions() {
    setSpecialPermissionsError(null);
    setCheckingSpecialPermissions(true);

    try {
      if (!specialPermissionsPassword.trim()) {
        throw new Error("Please enter the special permissions password.");
      }

      const response = await fetch(
        `/api/bundles/${bundleId}/special-access`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: specialPermissionsPassword,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || "Could not grant special permissions.",
        );
      }

      setSpecialPermissionsGranted(true);
    } catch (error) {
      setSpecialPermissionsGranted(false);
      setSpecialPermissionsError(
        error instanceof Error ? error.message : "Unknown error.",
      );
    } finally {
      setCheckingSpecialPermissions(false);
    }
  }

  const specialPermissionsRequired = useMemo(
    () => links.some((link) => Boolean(link.requiresSpecialPermissions)),
    [links],
  );

  useEffect(() => {
    if (!specialPermissionsRequired) {
      setSpecialPermissionsGranted(false);
      setSpecialPermissionsPassword("");
      setSpecialPermissionsError(null);
    }
  }, [specialPermissionsRequired]);

  const selectableLinks = useMemo(() => {
    return links.filter(
      (link) =>
        !link.paused &&
        !link.disabled &&
        (!link.requiresSpecialPermissions || specialPermissionsGranted),
    );
  }, [links, specialPermissionsGranted]);

  useEffect(() => {
    setSelectedLinkIds((current) => {
      const selectableLinkIds = new Set(
        links
          .filter(
            (link) =>
              !link.paused &&
              !link.disabled &&
              (!link.requiresSpecialPermissions || specialPermissionsGranted),
          )
          .map((link) => link.id),
      );
      const next = current.filter((linkId) => selectableLinkIds.has(linkId));

      return next.length === current.length ? current : next;
    });
  }, [links, specialPermissionsGranted]);

  const selectedLinks = useMemo(() => {
    return links.filter(
      (link) =>
        selectedLinkIds.includes(link.id) &&
        !link.paused &&
        !link.disabled &&
        (!link.requiresSpecialPermissions || specialPermissionsGranted),
    );
  }, [links, selectedLinkIds, specialPermissionsGranted]);

  const selectedCount = selectedLinks.length;
  const controllerBlocked = Boolean(controllerPolicy?.blocked);
  const shockCooldownRemaining = getShockCooldownRemaining(controllerPolicy);
  const selectedForcedWarnings = selectedLinks.filter((link) =>
    Boolean(link.forceWarning),
  );
  void nowTick;

  const selectedVibrateMaxIntensity = Math.max(
    0,
    ...selectedLinks.map(
      (link) => link.vibrateIntensityLimit,
    ),
  );

  const selectedVibrateMaxDurationSeconds = Math.max(
    0.1,
    ...selectedLinks.map(
      (link) => link.vibrateDurationLimitSeconds,
    ),
  );

  const selectedShockMaxIntensity = Math.max(
    0,
    ...selectedLinks.map(
      (link) => link.shockIntensityLimit,
    ),
  );

  const selectedShockMaxDurationSeconds = Math.max(
    0.1,
    ...selectedLinks.map(
      (link) => link.shockDurationLimitSeconds,
    ),
  );

  function toggleSelected(linkId: string, selected: boolean) {
    setSelectedLinkIds((current) => {
      if (selected) {
        return current.includes(linkId) ? current : [...current, linkId];
      }

      return current.filter((item) => item !== linkId);
    });
  }

  function selectAll() {
    setSelectedLinkIds(selectableLinks.map((link) => link.id));
  }

  function clearSelection() {
    setSelectedLinkIds([]);
  }

  function noteShockSent() {
    setControllerPolicy((current) =>
      current
        ? {
            ...current,
            lastShockAt: new Date().toISOString(),
          }
        : current,
    );
  }

  async function sendToSelected(
    mode: CommandMode,
    options?: {
      intensity?: number;
      duration?: number;
      warning?: boolean;
      warningLevel?: number;
    },
  ) {
    setGroupMessage(null);
    setGroupLoading(mode);

    try {
      if (!username.trim()) {
        throw new Error("Please enter a display name first.");
      }

      if (selectedLinks.length === 0) {
        throw new Error("Please select at least one shocker.");
      }

      if (controllerBlocked) {
        throw new Error(
          "Your inputs are currently blocked by the bundle manager.",
        );
      }

      if (mode === "s" && shockCooldownRemaining > 0) {
        throw new Error(`Shock is on cooldown for ${shockCooldownRemaining}s.`);
      }

      const usableLinks = selectedLinks.filter((link) => {
        if (link.paused || link.disabled) return false;
        if (mode === "v") return link.vibrateEnabled;
        if (mode === "s") return link.shockEnabled;
        return true;
      });

      if (usableLinks.length === 0) {
        throw new Error("None of the selected shockers allow this operation.");
      }

      const results = await Promise.all(
        usableLinks.map(async (link) => {
          const response = await fetch(`/api/bundles/${bundleId}/operate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              linkId: link.id,
              username: username.trim(),
              accessPassword,
              specialPermissionsPassword,
              sessionId,
              mode,
              intensity: mode === "e" ? 0 : (options?.intensity ?? 0),
              duration: mode === "e" ? 0 : (options?.duration ?? 0),
              warning:
                mode === "s"
                  ? Boolean(link.forceWarning) || (options?.warning ?? false)
                  : (options?.warning ?? false),
              warningLevel:
                mode === "s" && link.forceWarning
                  ? normalizeWarningLevel(link.forceWarningLevel)
                  : options?.warning
                    ? (options.warningLevel ?? 1)
                    : 0,
              hold: false,
            }),
          });

          const result = await response.json();

          return {
            link,
            ok: response.ok && result.ok,
            result,
          };
        }),
      );

      const failed = results.filter((item) => !item.ok);

      if (
        failed.some((item) => Boolean(item.result?.specialPermissionsRequired))
      ) {
        setSpecialPermissionsGranted(false);
        setSpecialPermissionsError(
          "The special permissions password is missing or no longer valid.",
        );
      }

      if (failed.length > 0) {
        setGroupMessage(
          `${results.length - failed.length}/${results.length} Commands successful. ${failed.length} failed.`,
        );
        return;
      }

      setGroupMessage(`${results.length} command(s) sent successfully.`);

      if (mode === "s") {
        noteShockSent();
      }
    } catch (error) {
      setGroupMessage(
        error instanceof Error ? error.message : "Unbekannter Fehler.",
      );
    } finally {
      setGroupLoading(null);
    }
  }

  return (
    <>
      {bundleDisabled && <DisabledBundleDialog title={bundleTitle} />}

      {!bundleDisabled && !accessGranted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-2xl font-bold">Enter control page</h2>

            <p className="mt-3 text-sm text-zinc-400">
              Choose a display name for the activity log.
              {requiresPassword
                ? " This bundle also requires an access password."
                : ""}
            </p>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Display name</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Your name"
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  autoFocus
                />
              </label>

              {requiresPassword && (
                <label className="grid gap-2">
                  <span className="text-sm text-zinc-300">Access password</span>
                  <input
                    type="password"
                    value={accessPassword}
                    onChange={(event) => setAccessPassword(event.target.value)}
                    placeholder="Password"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                  />
                </label>
              )}

              <button
                onClick={unlockAccess}
                disabled={checkingAccess}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkingAccess ? "Checking..." : "Continue"}
              </button>
            </div>

            {accessError && (
              <div className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-100">
                {accessError}
              </div>
            )}
          </div>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="text-sm text-zinc-400">Display name</div>
            <div className="mt-1 text-lg font-semibold">{username}</div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={showAdvanced}
              onChange={(event) => setShowAdvanced(event.target.checked)}
            />
            Show advanced information
          </label>
        </div>

        {controllerBlocked && (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-100">
            Your inputs are currently blocked by the bundle manager.
          </div>
        )}

        {shockCooldownRemaining > 0 && (
          <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-100">
            Shock cooldown active: {shockCooldownRemaining}s remaining.
          </div>
        )}

        {controllerTrackingWarning && showAdvanced && (
          <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-100">
            {controllerTrackingWarning}
          </div>
        )}
      </section>


      {accessGranted && specialPermissionsRequired && (
        <section className="mt-6 rounded-2xl border border-purple-800 bg-zinc-900 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-purple-200">
                Special permissions
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Some shockers require a separate password. This is independent
                from the page access password.
              </p>
            </div>

            {specialPermissionsGranted && (
              <span className="rounded-full border border-green-800 bg-green-950 px-3 py-1.5 text-xs font-medium text-green-200">
                Special shockers unlocked
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              type="password"
              value={specialPermissionsPassword}
              onChange={(event) => {
                setSpecialPermissionsPassword(event.target.value);
                setSpecialPermissionsGranted(false);
                setSpecialPermissionsError(null);
              }}
              placeholder="Special permissions password"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-purple-500"
            />

            <button
              type="button"
              onClick={unlockSpecialPermissions}
              disabled={checkingSpecialPermissions}
              className="rounded-lg bg-purple-700 px-5 py-3 text-sm font-semibold hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkingSpecialPermissions
                ? "Checking..."
                : specialPermissionsGranted
                  ? "Unlocked"
                  : "Unlock special shockers"}
            </button>
          </div>

          {specialPermissionsError && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-100">
              {specialPermissionsError}
            </div>
          )}
        </section>
      )}

      {selectedCount > 1 && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">
                Control selected shockers
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {selectedCount} shockers selected
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectAll}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
              >
                Select all
              </button>

              <button
                onClick={clearSelection}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
              >
                Clear selection
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <h3 className="font-semibold">Vibrate selected</h3>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">Intensity</span>
                    <span className="font-mono">{groupVibrateIntensity}</span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={selectedVibrateMaxIntensity}
                    value={groupVibrateIntensity}
                    onChange={(event) =>
                      setGroupVibrateIntensity(Number(event.target.value))
                    }
                  />
                </label>

                <label className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">Duration</span>
                    <span className="font-mono">{groupVibrateDuration} s</span>
                  </div>

                  <input
                    type="range"
                    min={0.1}
                    max={selectedVibrateMaxDurationSeconds}
                    step={0.1}
                    value={groupVibrateDuration}
                    onChange={(event) =>
                      setGroupVibrateDuration(Number(event.target.value))
                    }
                  />
                </label>

                <button
                  onClick={() =>
                    sendToSelected("v", {
                      intensity: groupVibrateIntensity,
                      duration: groupVibrateDuration,
                      warning: false,
                      warningLevel: 0,
                    })
                  }
                  disabled={
                    !username.trim() ||
                    controllerBlocked ||
                    selectedCount === 0 ||
                    groupLoading !== null
                  }
                  className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {groupLoading === "v" ? "Sending..." : "Vibrate selected"}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-red-900 bg-zinc-950 p-4">
              <h3 className="font-semibold text-red-200">Shock selected</h3>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">Intensity</span>
                    <span className="font-mono">{groupShockIntensity}</span>
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={selectedShockMaxIntensity}
                    value={groupShockIntensity}
                    onChange={(event) =>
                      setGroupShockIntensity(Number(event.target.value))
                    }
                  />
                </label>

                <label className="grid gap-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-300">Duration</span>
                    <span className="font-mono">{groupShockDuration} s</span>
                  </div>

                  <input
                    type="range"
                    min={0.1}
                    max={selectedShockMaxDurationSeconds}
                    step={0.1}
                    value={groupShockDuration}
                    onChange={(event) =>
                      setGroupShockDuration(Number(event.target.value))
                    }
                  />
                </label>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={groupShockWarning}
                      onChange={(event) =>
                        setGroupShockWarning(event.target.checked)
                      }
                    />
                    <span>Enable warning</span>
                  </label>

                  {groupShockWarning && (
                    <label className="mt-3 grid gap-2 text-sm">
                      <span className="text-zinc-300">Warning Level</span>

                      <select
                        value={groupShockWarningLevel}
                        onChange={(event) =>
                          setGroupShockWarningLevel(Number(event.target.value))
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
                      >
                        <option value={1}>Level 1</option>
                        <option value={2}>Level 2</option>
                        <option value={3}>Level 3</option>
                      </select>
                    </label>
                  )}
                </div>

                {selectedForcedWarnings.length > 0 && (
                  <p className="text-sm text-yellow-200">
                    {selectedForcedWarnings.length} selected shocker(s) require
                    a manager-set warning level.
                  </p>
                )}

                <button
                  onClick={() =>
                    sendToSelected("s", {
                      intensity: groupShockIntensity,
                      duration: groupShockDuration,
                      warning: groupShockWarning,
                      warningLevel: groupShockWarningLevel,
                    })
                  }
                  disabled={
                    !username.trim() ||
                    controllerBlocked ||
                    shockCooldownRemaining > 0 ||
                    selectedCount === 0 ||
                    groupLoading !== null
                  }
                  className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {groupLoading === "s" ? "Sending..." : "Shock selected"}
                </button>
              </div>
            </section>
          </div>

          <button
            onClick={() => sendToSelected("e")}
            disabled={
              !username.trim() ||
              controllerBlocked ||
              selectedCount === 0 ||
              groupLoading !== null
            }
            className="mt-4 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {groupLoading === "e" ? "Stopping..." : "Stop selected"}
          </button>

          {showAdvanced && groupMessage && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200">
              {groupMessage}
            </div>
          )}
        </section>
      )}

      <section className="mt-6 grid gap-4">
        {links.map((link) => (
          <LinkControlCard
            key={link.id}
            bundleId={bundleId}
            link={link}
            username={username}
            accessPassword={accessPassword}
            specialPermissionsPassword={specialPermissionsPassword}
            specialPermissionsGranted={specialPermissionsGranted}
            selected={selectedLinkIds.includes(link.id)}
            onSelectedChange={(selected) => toggleSelected(link.id, selected)}
            showAdvanced={showAdvanced}
            sessionId={sessionId}
            controllerBlocked={controllerBlocked}
            shockCooldownRemainingSeconds={shockCooldownRemaining}
            onShockCommandSent={noteShockSent}
            onSpecialPermissionsRejected={() => {
              setSpecialPermissionsGranted(false);
              setSpecialPermissionsError(
                "The special permissions password is missing or no longer valid.",
              );
            }}
          />
        ))}
      </section>
    </>
  );
}
function DisabledBundleDialog({ title }: { title: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-disabled-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-red-900 bg-zinc-900 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-800 bg-red-950 text-xl">
          !
        </div>

        <h2 id="bundle-disabled-title" className="mt-4 text-2xl font-bold">
          Page currently disabled
        </h2>

        <p className="mt-3 text-sm text-zinc-300">
          {title.trim() || "This bundle"} is currently not available. Controls
          remain blocked until the link is activated again.
        </p>

        <p className="mt-4 text-xs text-zinc-500">
          This window will close automatically as soon as the page is available
          again.
        </p>
      </div>
    </div>
  );
}
