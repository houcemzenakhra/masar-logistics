import { redirect } from "next/navigation";

/** Short tracking link used in text messages, where every character costs. */
export default async function Short({ params }: { params: Promise<{ tracking: string }> }) {
  redirect(`/track/${encodeURIComponent((await params).tracking)}`);
}
