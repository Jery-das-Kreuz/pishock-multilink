"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ManageBundlePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function disableBundle() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/bundles/${params.id}/disable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Bundle konnte nicht deaktiviert werden.");
      }

      setMessage("Bundle wurde deaktiviert.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h1 className="text-2xl font-bold">Bundle verwalten</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Hier kannst du dieses Bundle deaktivieren. Danach ist die öffentliche
            Seite nicht mehr nutzbar.
          </p>

          <button
            onClick={disableBundle}
            disabled={loading || !token}
            className="mt-6 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Deaktiviere..." : "Bundle deaktivieren"}
          </button>

          {!token && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">
              Kein Creator-Token in der URL gefunden.
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm">
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}