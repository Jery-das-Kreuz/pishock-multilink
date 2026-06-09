import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BundleControlPanel } from "@/components/BundleControlPanel";

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

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${Math.round(ms / 1000)}s`;
  }

  return `${ms}ms`;
}

export default async function BundlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, created_at, expires_at, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !data || data.disabled) {
    notFound();
  }

  const links = data.links as StoredLink[];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h1 className="text-3xl font-bold">{data.title}</h1>

          <p className="mt-3 text-sm text-zinc-400">
            This page bundles multiple PiShock LinkControl links and lets you control them from one interface.
          </p>
        </header>

        <BundleControlPanel
          bundleId={data.id}
          links={links}
          requiresPassword={Boolean(data.access_password_hash)}
        />
      </div>
    </main>
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