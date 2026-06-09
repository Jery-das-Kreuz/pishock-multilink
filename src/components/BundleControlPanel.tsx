"use client";

import { useMemo, useState } from "react";
import { LinkControlCard } from "@/components/LinkControlCard";

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
  links: StoredLink[];
  requiresPassword: boolean;
};

type CommandMode = "s" | "v" | "e";

export function BundleControlPanel({ bundleId, links, requiresPassword }: Props) {
  const [username, setUsername] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [selectedUuids, setSelectedUuids] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [groupVibrateIntensity, setGroupVibrateIntensity] = useState(10);
  const [groupVibrateDuration, setGroupVibrateDuration] = useState(1);

  const [groupShockIntensity, setGroupShockIntensity] = useState(5);
  const [groupShockDuration, setGroupShockDuration] = useState(.3);
  const [groupShockWarning, setGroupShockWarning] = useState(false);
  const [groupShockWarningLevel, setGroupShockWarningLevel] = useState(1);

  const [groupLoading, setGroupLoading] = useState<CommandMode | null>(null);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);

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

  const selectableLinks = useMemo(() => {
    return links.filter((link) => !link.paused && !link.forceLogin);
  }, [links]);

  const selectedLinks = useMemo(() => {
    return links.filter((link) => selectedUuids.includes(link.uuid));
  }, [links, selectedUuids]);

  const selectedCount = selectedLinks.length;

  const selectedVibrateMaxIntensity = Math.max(
    0,
    ...selectedLinks.map(
      (link) => link.vibrateIntensityLimit ?? link.intensityLimit ?? link.maxIntensity
    )
  );

  const selectedVibrateMaxDurationSeconds = Math.max(
    0.1,
    ...selectedLinks.map(
      (link) =>
        link.vibrateDurationLimitSeconds ??
        link.durationLimitSeconds ??
        link.maxDurationSeconds ??
        Math.floor(link.maxDuration / 1000)
    )
  );

  const selectedShockMaxIntensity = Math.max(
    0,
    ...selectedLinks.map(
      (link) => link.shockIntensityLimit ?? link.intensityLimit ?? link.maxIntensity
    )
  );

  const selectedShockMaxDurationSeconds = Math.max(
    0.1,
    ...selectedLinks.map(
      (link) =>
        link.shockDurationLimitSeconds ??
        link.durationLimitSeconds ??
        link.maxDurationSeconds ??
        Math.floor(link.maxDuration / 1000)
    )
  );

  function toggleSelected(uuid: string, selected: boolean) {
    setSelectedUuids((current) => {
      if (selected) {
        return current.includes(uuid) ? current : [...current, uuid];
      }

      return current.filter((item) => item !== uuid);
    });
  }

  function selectAll() {
    setSelectedUuids(selectableLinks.map((link) => link.uuid));
  }

  function clearSelection() {
    setSelectedUuids([]);
  }

  async function sendToSelected(
    mode: CommandMode,
    options?: {
      intensity?: number;
      duration?: number;
      warning?: boolean;
      warningLevel?: number;
    }
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

      const usableLinks = selectedLinks.filter((link) => {
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

          return {
            link,
            ok: response.ok && result.ok,
            result,
          };
        })
      );

      const failed = results.filter((item) => !item.ok);

      if (failed.length > 0) {
        setGroupMessage(
          `${results.length - failed.length}/${results.length} Commands successful. ${failed.length} failed.`
        );
        return;
      }

      setGroupMessage(`${results.length} command(s) sent successfully.`);
    } catch (error) {
      setGroupMessage(error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setGroupLoading(null);
    }
  }

  return (
    <>
      {!accessGranted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-2xl font-bold">Enter control page</h2>

            <p className="mt-3 text-sm text-zinc-400">
              Choose a display name for the PiShock log.
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
      </section>

      {selectedCount > 1 && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
                <h2 className="text-xl font-semibold">Control selected shockers</h2>
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
                    disabled={!username.trim() || selectedCount === 0 || groupLoading !== null}
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
                        onChange={(event) => setGroupShockWarning(event.target.checked)}
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

                <button
                    onClick={() =>
                    sendToSelected("s", {
                        intensity: groupShockIntensity,
                        duration: groupShockDuration,
                        warning: groupShockWarning,
                        warningLevel: groupShockWarningLevel,
                    })
                    }
                    disabled={!username.trim() || selectedCount === 0 || groupLoading !== null}
                    className="rounded-lg bg-red-700 px-5 py-3 text-sm font-semibold hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {groupLoading === "s" ? "Sending..." : "Shock selected"}
                </button>
                </div>
            </section>
            </div>

            <button
            onClick={() => sendToSelected("e")}
            disabled={!username.trim() || selectedCount === 0 || groupLoading !== null}
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
            key={link.uuid}
            bundleId={bundleId}
            link={link}
            username={username}
            accessPassword={accessPassword}
            selected={selectedUuids.includes(link.uuid)}
            onSelectedChange={(selected) => toggleSelected(link.uuid, selected)}
            showAdvanced={showAdvanced}
          />
        ))}
      </section>
    </>
  );
}