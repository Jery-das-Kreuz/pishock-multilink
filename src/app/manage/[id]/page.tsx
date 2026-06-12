import type { Metadata } from "next";
import { ManageBundleEditor } from "@/components/ManageBundleEditor";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";

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
    title: `${title} Management`,
  };
}

export default async function ManageBundlePage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;

  return <ManageBundleEditor bundleId={id} token={token ?? ""} />;
}
