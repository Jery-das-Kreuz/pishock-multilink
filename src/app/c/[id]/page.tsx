import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BundleControlPanel } from "@/components/BundleControlPanel";

export const dynamic = "force-dynamic";

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

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;

  const { data } = await supabaseAdmin
    .from("bundles")
    .select("title")
    .eq("id", id)
    .single();

  const title = String(data?.title ?? "PiShock Bundle").trim() || "PiShock Bundle";

  return {
    title,
  };
}

export default async function BundlePage({ params }: PageProps) {
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("bundles")
    .select("id, title, links, created_at, expires_at, disabled, access_password_hash")
    .eq("id", id)
    .single();

  if (error || !data) {
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
          initialTitle={data.title}
          links={links}
          requiresPassword={Boolean(data.access_password_hash)}
          initialDisabled={Boolean(data.disabled)}
        />
      </div>
    </main>
  );
}
