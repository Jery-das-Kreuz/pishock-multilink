"use client";

import { useMemo, useState } from "react";

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

type BundleLink = {
  localId: string;
  customName: string;
  uuid: string;
  url: string;
  data: PiShockLinkInfo;
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
    throw new Error("No valid link ID was found in the link.");
  }

  return id;
}

function createPiShockUrl(uuid: string): string {
  return `https://pishock.com/#/LinkControl?id=${uuid}`;
}

export default function Home() {
  const [bundleTitle, setBundleTitle] = useState("My PiShock Bundle");
  const [customName, setCustomName] = useState("");
  const [input, setInput] = useState("");

  const [links, setLinks] = useState<BundleLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const [manageUrl, setManageUrl] = useState<string | null>(null);

  const bundleJson = useMemo(() => {
    return {
      title: bundleTitle,
      links: links.map((link) => ({
        name: link.customName,
        uuid: link.uuid,
        url: link.url,
        pishockName: link.data.Name,
        shockEnabled: link.data.ShockEnabled,
        vibrateEnabled: link.data.VibrateEnabled,
        beepEnabled: link.data.BeepEnabled,
        maxIntensity: link.data.MaxIntensity,
        maxDuration: link.data.MaxDuration,
        forceLogin: link.data.ForceLogin,
        paused: link.data.Paused,
        expiry: link.data.Expiry,
      })),
    };
  }, [bundleTitle, links]);

  async function addLink() {
    setError(null);
    setLoading(true);

    try {
      if (links.length >= 10) {
        throw new Error("A maximum of 10 links per bundle is allowed.");
      }

      const uuid = extractPiShockLinkId(input);

      if (links.some((link) => link.uuid.toLowerCase() === uuid.toLowerCase())) {
        throw new Error("This link has already been added.");
      }

      const response = await fetch(`https://api.pishock.com/Links/${uuid}`);

      if (!response.ok) {
        throw new Error(`PiShock API error: ${response.status}`);
      }

      const data = (await response.json()) as PiShockLinkInfo;

      const newLink: BundleLink = {
        localId: crypto.randomUUID(),
        customName: customName.trim() || data.Name || `Link ${links.length + 1}`,
        uuid,
        url: createPiShockUrl(uuid),
        data,
      };

      setLinks((current) => [...current, newLink]);
      setInput("");
      setCustomName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }

  function removeLink(localId: string) {
    setLinks((current) => current.filter((link) => link.localId !== localId));
  }

  async function createBundle() {
    setError(null);
    setShareUrl(null);
    setCreating(true);

    try {
      if (links.length === 0) {
        throw new Error("Add at least one link first.");
      }

      const response = await fetch("/api/bundles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: bundleTitle,
          links: links.map((link) => ({
            name: link.customName,
            uuid: link.uuid,
          })),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Bundle could not be created.");
      }

      const absoluteUrl = `${window.location.origin}${result.path}`;
      const absoluteManageUrl = `${window.location.origin}${result.managePath}`;

      setShareUrl(absoluteUrl);
      setManageUrl(absoluteManageUrl);

await navigator.clipboard.writeText(absoluteUrl);

      await navigator.clipboard.writeText(absoluteUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header>
          <h1 className="text-3xl font-bold">PiShock Multi-Link Builder</h1>
          <p className="mt-3 max-w-2xl text-sm text-zinc-400">
            Add multiple PiShock LinkControl links. The page validates each link
            against public metadata and builds a local bundle preview.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h2 className="text-xl font-semibold">Create bundle</h2>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm text-zinc-300">Bundle title</span>
              <input
                value={bundleTitle}
                onChange={(event) => setBundleTitle(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">Custom name</span>
                <input
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder="e.g. Left Arm"
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-zinc-300">PiShock link</span>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://pishock.com/#/LinkControl?id=..."
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-blue-500"
                />
              </label>

              <div className="flex items-end">
                <button
                  onClick={addLink}
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Checking..." : "Add"}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{bundleTitle}</h2>
              <p className="mt-1 text-sm text-zinc-400">
                {links.length} of 10 links added
              </p>
            </div>

            <button
              onClick={createBundle}
              disabled={links.length === 0 || creating}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create bundle link"}
            </button>
            {shareUrl && (
              <div className="mt-5 rounded-xl border border-green-800 bg-green-950 p-4 text-sm text-green-100">
                <div className="font-semibold">Bundle created and link copied:</div>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block break-all font-mono underline"
                >
                  {shareUrl}
                </a>
              </div>
            )}
            {manageUrl && (
              <div className="mt-4 rounded-xl border border-yellow-800 bg-yellow-950 p-4 text-sm text-yellow-100">
                <div className="font-semibold">Private creator link:</div>
                <a
                  href={manageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block break-all font-mono underline"
                >
                  {manageUrl}
                </a>
                <p className="mt-2 text-xs text-yellow-200">
                  Do not share this link publicly. It allows the bundle to be managed later.
                </p>
              </div>
            )}
          </div>

          {links.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
              No links added yet.
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {links.map((link) => (
                <LinkCard
                  key={link.localId}
                  link={link}
                  onRemove={() => removeLink(link.localId)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LinkCard({
  link,
  onRemove,
}: {
  link: BundleLink;
  onRemove: () => void;
}) {
  const disabled = link.data.Paused || link.data.ForceLogin;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{link.customName}</h3>

            {link.data.Paused ? (
              <Badge variant="danger">Paused</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            )}

            {link.data.ForceLogin && (
              <Badge variant="warning">Force Login</Badge>
            )}
          </div>

          <p className="mt-1 text-sm text-zinc-400">
            Official name: {link.data.Name}
          </p>

          <p className="mt-2 break-all font-mono text-xs text-zinc-500">
            {link.uuid}
          </p>
        </div>

        <div className="flex gap-2">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            Open
          </a>

          <button
            onClick={onRemove}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-800"
          >
            Remove
          </button>
        </div>
      </div>

      {disabled && (
        <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-100">
          This link may be problematic for no-login use: {" "}
          {link.data.Paused && "The link is paused. "}
          {link.data.ForceLogin && "Force login is enabled. "}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoBox
          label="Shock"
          value={link.data.ShockEnabled ? "Enabled" : "Off"}
        />
        <InfoBox
          label="Vibrate"
          value={link.data.VibrateEnabled ? "Enabled" : "Off"}
        />
        <InfoBox label="Beep" value={link.data.BeepEnabled ? "Enabled" : "Off"} />
        <InfoBox label="Max Intensity" value={link.data.MaxIntensity} />
        <InfoBox
          label="Max Duration"
          value={`${Math.round(link.data.MaxDuration / 1000)}s`}
        />
        <InfoBox
          label="Remaining"
          value={
            link.data.RemainingActivations === -1
              ? "Unlimited"
              : link.data.RemainingActivations
          }
        />
        <InfoBox label="Expiry" value={link.data.Expiry ?? "None"} />
        <InfoBox label="LinkId" value={link.data.LinkId} />
      </div>
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