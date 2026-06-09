import { ManageBundleEditor } from "@/components/ManageBundleEditor";

export default async function ManageBundlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;

  return <ManageBundleEditor bundleId={id} token={token ?? ""} />;
}