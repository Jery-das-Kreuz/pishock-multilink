"use client";

import { type ReactNode, useState } from "react";

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
  link: StoredLink;
  username: string;
  accessPassword: string;
  specialPermissionsPassword: string;
  specialPermissionsGranted: boolean;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  showAdvanced: boolean;
  sessionId?: string;
  controllerBlocked?: boolean;
  shockCooldownRemainingSeconds?: number;
  onShockCommandSent?: () => void;
  onSpecialPermissionsRejected?: () => void;
};

type CommandMode = "s" | "v" | "e";

function randomIntensity(maxIntensity: number) {
  const safeMax = Math.max(0, Math.floor(maxIntensity));

  return Math.floor(Math.random() * (safeMax + 1));
}

function normalizeWarningLevel(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

export function LinkControlCard({
  bundleId,
  link,
  username,
  accessPassword,
  specialPermissionsPassword,
  specialPermissionsGranted,
  selected,
  onSelectedChange,
  showAdvanced,
  sessionId,
  controllerBlocked = false,
  shockCooldownRemainingSeconds = 0,
  onShockCommandSent,
  onSpecialPermissionsRejected,
}: Props) {
  const vibrateMaxIntensity = link.vibrateIntensityLimit;
  const vibrateMaxDurationSeconds = link.vibrateDurationLimitSeconds;
  const shockMaxIntensity = link.shockIntensityLimit;
  const shockMaxDurationSeconds = link.shockDurationLimitSeconds;

  const forcedWarning = Boolean(link.forceWarning);
  const forcedWarningLevel = normalizeWarningLevel(link.forceWarningLevel);
  const managerDisabled = Boolean(link.disabled);
  const specialPermissionLocked =
    Boolean(link.requiresSpecialPermissions) && !specialPermissionsGranted;
  const shockCooldownRemaining = Math.max(
    0,
    Math.ceil(shockCooldownRemainingSeconds),
  );

  const [vibrateIntensity, setVibrateIntensity] = useState(
    Math.min(10, vibrateMaxIntensity),
  );
  const [vibrateDuration, setVibrateDuration] = useState(
    Math.min(1, vibrateMaxDurationSeconds),
  );

  const [shockIntensity, setShockIntensity] = useState(
    Math.min(5, shockMaxIntensity),
  );
  const [shockDuration, setShockDuration] = useState(
    Math.min(0.3, shockMaxDurationSeconds),
  );

  const [shockWarning, setShockWarning] = useState(false);
  const [shockWarningLevel, setShockWarningLevel] = useState(1);

  const [message, setMessage] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<CommandMode | null>(null);

  const baseDisabled =
    managerDisabled || link.paused || !username.trim() || controllerBlocked;
  const protectedControlDisabled = baseDisabled || specialPermissionLocked;
  const shockDisabled =
    protectedControlDisabled || shockCooldownRemaining > 0;

  async function sendCommand(
    mode: CommandMode,
    options?: {
      intensity?: number;
      duration?: number;
      warning?: boolean;
      warningLevel?: number;
    },
  ) {
    setMessage(null);
    setLoadingMode(mode);

    try {
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
          warning: options?.warning ?? false,
          warningLevel: options?.warning ? (options.warningLevel ?? 1) : 0,
          hold: false,
        }),
      });

      const result = await response.json();

      if (result.specialPermissionsRequired) {
        onSpecialPermissionsRejected?.();
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Command failed.");
      }

      setMessage(result.message || "Command sent.");

      if (mode === "s") {
        onShockCommandSent?.();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error.");
    } finally {
      setLoadingMode(null);
    }
  }

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected}
                disabled={
                  managerDisabled || link.paused || specialPermissionLocked
                }
                onChange={(event) => onSelectedChange(event.target.checked)}
              />
              <span>Select</span>
            </label>

            <h2 className="text-xl font-semibold">{link.name}</h2>

            {managerDisabled ? (
              <Badge variant="danger">Disabled</Badge>
            ) : link.paused ? (
              <Badge variant="danger">Paused</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}

            {link.forceLogin && <Badge variant="warning">Login required</Badge>}
            {link.requiresSpecialPermissions && (
              <Badge
                variant={specialPermissionsGranted ? "success" : "warning"}
              >
                {specialPermissionsGranted
                  ? "Special access unlocked"
                  : "Special permissions required"}
              </Badge>
            )}
            {forcedWarning && (
              <Badge variant="warning">
                Warning Duration {forcedWarningLevel}
              </Badge>
            )}
          </div>


          {managerDisabled && (
            <p className="mt-2 text-sm text-red-300">
              This shocker is disabled by the bundle manager.
            </p>
          )}

          {!username.trim() && (
            <p className="mt-2 text-sm text-yellow-300">
              Enter a display name above to enable controls.
            </p>
          )}

          {controllerBlocked && (
            <p className="mt-2 text-sm text-red-300">
              Your inputs are currently blocked by the bundle manager.
            </p>
          )}

          {specialPermissionLocked && (
            <p className="mt-2 text-sm text-purple-200">
              Enter the special permissions password above to unlock this
              shocker. The Stop command remains available.
            </p>
          )}

          {forcedWarning && (
            <p className="mt-2 text-sm text-yellow-200">
              The manager requires shock warning duration {forcedWarningLevel} for
              this shocker.
            </p>
          )}

          {shockCooldownRemaining > 0 && (
            <p className="mt-2 text-sm text-yellow-300">
              Shock is on cooldown for {shockCooldownRemaining}s.
            </p>
          )}
        </div>

      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="font-semibold">Vibrate</h3>

          {!link.vibrateEnabled ? (
            <p className="mt-3 text-sm text-zinc-500">
              Vibrate is not allowed for this link.
            </p>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-300">Intensity</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{vibrateIntensity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setVibrateIntensity(
                          randomIntensity(vibrateMaxIntensity),
                        )
                      }
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      Randomise
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={vibrateMaxIntensity}
                  value={vibrateIntensity}
                  onChange={(event) =>
                    setVibrateIntensity(Number(event.target.value))
                  }
                  aria-label="Vibrate intensity"
                />
              </div>

              <label className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">Duration</span>
                  <span className="font-mono">{vibrateDuration} s</span>
                </div>

                <input
                  type="range"
                  min={0.1}
                  max={vibrateMaxDurationSeconds}
                  step={0.1}
                  value={vibrateDuration}
                  onChange={(event) =>
                    setVibrateDuration(Number(event.target.value))
                  }
                />
              </label>

              <button
                onClick={() =>
                  sendCommand("v", {
                    intensity: vibrateIntensity,
                    duration: vibrateDuration,
                    warning: false,
                    warningLevel: 0,
                  })
                }
                disabled={protectedControlDisabled || loadingMode !== null}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMode === "v" ? "Sending..." : "Vibrate"}
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-red-900 bg-zinc-950 p-4">
          <h3 className="font-semibold text-red-200">Shock</h3>

          {!link.shockEnabled ? (
            <p className="mt-3 text-sm text-zinc-500">
              Shock is not allowed for this link.
            </p>
          ) : (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-300">Intensity</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{shockIntensity}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setShockIntensity(randomIntensity(shockMaxIntensity))
                      }
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      Randomise
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={shockMaxIntensity}
                  value={shockIntensity}
                  onChange={(event) =>
                    setShockIntensity(Number(event.target.value))
                  }
                  aria-label="Shock intensity"
                />
              </div>

              <label className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-300">Duration</span>
                  <span className="font-mono">{shockDuration} s</span>
                </div>

                <input
                  type="range"
                  min={0.1}
                  max={shockMaxDurationSeconds}
                  step={0.1}
                  value={shockDuration}
                  onChange={(event) =>
                    setShockDuration(Number(event.target.value))
                  }
                />
              </label>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={forcedWarning || shockWarning}
                    disabled={forcedWarning}
                    onChange={(event) => setShockWarning(event.target.checked)}
                  />
                  <span>
                    {forcedWarning
                      ? "Warning required by manager"
                      : "Enable warning"}
                  </span>
                </label>

                {(forcedWarning || shockWarning) && (
                  <label className="mt-3 grid gap-2 text-sm">
                    <span className="text-zinc-300">Warning Duration</span>

                    <select
                      value={
                        forcedWarning ? forcedWarningLevel : shockWarningLevel
                      }
                      disabled={forcedWarning}
                      onChange={(event) =>
                        setShockWarningLevel(Number(event.target.value))
                      }
                      className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-blue-500"
                    >
                      <option value={1}>Short</option>
                      <option value={2}>Medium</option>
                      <option value={3}>Long</option>
                    </select>
                  </label>
                )}
              </div>

              <button
                onClick={() =>
                  sendCommand("s", {
                    intensity: shockIntensity,
                    duration: shockDuration,
                    warning: forcedWarning || shockWarning,
                    warningLevel: forcedWarning
                      ? forcedWarningLevel
                      : shockWarningLevel,
                  })
                }
                disabled={shockDisabled || loadingMode !== null}
                className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMode === "s" ? "Sending..." : "Shock"}
              </button>
            </div>
          )}
        </section>
      </div>

      <button
        onClick={() => sendCommand("e")}
        disabled={baseDisabled || loadingMode !== null}
        className="mt-4 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loadingMode === "e" ? "Stopping..." : "Stop"}
      </button>

      {showAdvanced && (
        <>
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
              label="Shock limit"
              value={`${shockMaxIntensity} / ${shockMaxDurationSeconds}s`}
            />
            <InfoBox
              label="Vibrate limit"
              value={`${vibrateMaxIntensity} / ${vibrateMaxDurationSeconds}s`}
            />
            <InfoBox
              label="Forced warning"
              value={forcedWarning ? `Level ${forcedWarningLevel}` : "Off"}
            />
            <InfoBox
              label="Special permissions"
              value={
                link.requiresSpecialPermissions
                  ? specialPermissionsGranted
                    ? "Unlocked"
                    : "Required"
                  : "Not required"
              }
            />
            <InfoBox
              label="Manager status"
              value={managerDisabled ? "Disabled" : "Enabled"}
            />
          </div>

          {message && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-200">
              {message}
            </div>
          )}
        </>
      )}
    </article>
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
