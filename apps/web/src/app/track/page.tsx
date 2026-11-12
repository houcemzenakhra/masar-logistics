import { redirect } from "next/navigation";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";

export const metadata = { title: "Track a parcel" };

export default async function TrackSearch({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  if (n?.trim()) redirect(`/track/${encodeURIComponent(n.trim().toUpperCase())}`);
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight">Track a parcel</h1>
        <p className="mb-8 mt-3 text-ink-2">Enter the tracking number printed on the label or sent to you by SMS.</p>
        <TrackForm large />
      </main>
      <SiteFooter />
    </>
  );
}
