import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { BundleControlPanel } from "@/components/BundleControlPanel";
import { toPublicBundleLink } from "@/lib/publicBundleLinks";

export const dynamic = "force-dynamic";

type StoredLink = Parameters<typeof toPublicBundleLink>[1];

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

  const title = String(data?.title ?? "Control Bundle").trim() || "Control Bundle";

  return {
    title: `${title} Control`,
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

  const links = (data.links as StoredLink[]).map((link) =>
    toPublicBundleLink(data.id, link),
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h1 className="text-3xl font-bold">{data.title}</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Control the configured devices from one protected interface. All
            limits set by the bundle manager are enforced by the server.
          </p>
        </header>

        <section className="mt-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 text-sm text-cyan-50 shadow-lg shadow-cyan-950/20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-cyan-200">Control from inside VR</h2>
              <p className="mt-1 text-cyan-100/80">
                OVR Toolkit users can subscribe to the PiShock Wrist Module on Steam Workshop to control
                these shockers directly through the OVR Toolkit wristwatch while in-game.
              </p>
              <p className="mt-2 text-cyan-100/80">
                Just follow the instructions in the workshop description to set it up!
              </p>
            </div>

            <a
              href="https://steamcommunity.com/sharedfiles/filedetails/?id=3743157347"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-300/60 bg-cyan-300 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              Open Workshop Module
            </a>
          </div>
        </section>

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
