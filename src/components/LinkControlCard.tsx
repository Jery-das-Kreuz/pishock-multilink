"use client";

import { useState } from "react";

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

  forceLogin: boolean;
  paused: boolean;
  remainingActivations: number;
  expiry: string | null;

  vibrateIntensityLimit?: number;
  vibrateDurationLimitSeconds?: number;
  shockIntensityLimit?: number;
  shockDurationLimitSeconds?: number;
  intensityLimit?: number;
  durationLimitSeconds?: number;
  maxDurationSeconds?: number;
};

type Props = {
  bundleId: string;
  link: StoredLink;
  username: string;
  accessPassword: string;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  showAdvanced: boolean;
};

type CommandMode = "s" | "v" | "e";

function randomIntensity(maxIntensity: number) {
  const safeMax = Math.max(0, Math.floor(maxIntensity));

  return Math.floor(Math.random() * (safeMax + 1));
}

export function LinkControlCard({
  bundleId,
  link,
  username,
  accessPassword,
  selected,
  onSelectedChange,
  showAdvanced,
}: Props) {
  const vibrateMaxIntensity =
    link.vibrateIntensityLimit ?? link.intensityLimit ?? link.maxIntensity;

  const vibrateMaxDurationSeconds =
    link.vibrateDurationLimitSeconds ??
    link.durationLimitSeconds ??
    link.maxDurationSeconds ??
    Math.floor(link.maxDuration / 1000);

  const shockMaxIntensity =
    link.shockIntensityLimit ?? link.intensityLimit ?? link.maxIntensity;

  const shockMaxDurationSeconds =
    link.shockDurationLimitSeconds ??
    link.durationLimitSeconds ??
    link.maxDurationSeconds ??
    Math.floor(link.maxDuration / 1000);

  const [vibrateIntensity, setVibrateIntensity] = useState(
    Math.min(10, vibrateMaxIntensity)
  );
  const [vibrateDuration, setVibrateDuration] = useState(
    Math.min(1, vibrateMaxDurationSeconds)
  );

  const [shockIntensity, setShockIntensity] = useState(
    Math.min(5, shockMaxIntensity)
  );
  const [shockDuration, setShockDuration] = useState(
    Math.min(0.3, shockMaxDurationSeconds)
  );

  const [shockWarning, setShockWarning] = useState(false);
  const [shockWarningLevel, setShockWarningLevel] = useState(1);

  const [message, setMessage] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<CommandMode | null>(null);

  const baseDisabled = link.paused || !username.trim();

  async function sendCommand(
    mode: CommandMode,
    options?: {
      intensity?: number;
      duration?: number;
      warning?: boolean;
      warningLevel?: number;
    }
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
          uuid: link.uuid,
          username: username.trim(),
          accessPassword,
          mode,
          intensity: mode === "e" ? 0 : options?.intensity ?? 0,
          duration: mode === "e" ? 0 : options?.duration ?? 0,
          warning: options?.warning ?? false,
          warningLevel: options?.warning ? options.warningLevel ?? 1 : 0,
          hold: false,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || result.result?.Message || "Command failed."
        );
      }

      setMessage(result.result?.Message || "Command sent.");
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
                disabled={link.paused}
                onChange={(event) => onSelectedChange(event.target.checked)}
              />
              <span>Select</span>
            </label>

            <h2 className="text-xl font-semibold">{link.name}</h2>

            {link.paused ? (
              <Badge variant="danger">Paused</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}

            {link.forceLogin && <Badge variant="warning">Force Login</Badge>}
          </div>

          <p className="mt-1 text-sm text-zinc-400">
            Official name: {link.pishockName}
          </p>

          {!username.trim() && (
            <p className="mt-2 text-sm text-yellow-300">
              Enter a display name above to enable controls.
            </p>
          )}
        </div>

        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-800"
        >
          Official page
        </a>
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
                        setVibrateIntensity(randomIntensity(vibrateMaxIntensity))
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
                disabled={baseDisabled || loadingMode !== null}
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
                    checked={shockWarning}
                    onChange={(event) => setShockWarning(event.target.checked)}
                  />
                  <span>Enable warning</span>
                </label>

                {shockWarning && (
                  <label className="mt-3 grid gap-2 text-sm">
                    <span className="text-zinc-300">Warning Duration</span>

                    <select
                      value={shockWarningLevel}
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
                    warning: shockWarning,
                    warningLevel: shockWarningLevel,
                  })
                }
                disabled={baseDisabled || loadingMode !== null}
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
        disabled={!username.trim() || loadingMode !== null}
        className="mt-4 rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loadingMode === "e" ? "Stopping..." : "Stop"}
      </button>

      {showAdvanced && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBox label="Shock" value={link.shockEnabled ? "Allowed" : "Off"} />
            <InfoBox
              label="Vibrate"
              value={link.vibrateEnabled ? "Allowed" : "Off"}
            />
            <InfoBox label="Max Intensity" value={link.maxIntensity} />
            <InfoBox label="Max Duration" value={`${link.maxDuration} s`} />
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

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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
  children: string;
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