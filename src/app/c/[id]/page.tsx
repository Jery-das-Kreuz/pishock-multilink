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
    .select(
      "id, title, links, created_at, expires_at, disabled, access_password_hash, show_vr_control_banner",
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const links = (data.links as StoredLink[])
    .filter((link) => !link.hidden)
    .map((link) => toPublicBundleLink(data.id, link));

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h1 className="text-2xl font-bold sm:text-3xl">{data.title}</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Control the configured devices from one protected interface. All
            limits set by the bundle manager are enforced by the server.
          </p>
        </header>

        <BundleControlPanel
          bundleId={data.id}
          initialTitle={data.title}
          links={links}
          requiresPassword={Boolean(data.access_password_hash)}
          initialDisabled={Boolean(data.disabled)}
          initialShowVrControlBanner={data.show_vr_control_banner !== false}
        />
      </div>
    </main>
  );
}
