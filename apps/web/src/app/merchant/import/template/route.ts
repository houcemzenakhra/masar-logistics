import { getSession } from "@/lib/session";
import { templateCsv } from "@/server/services/imports";

/** The CSV template, with column titles in the language asked for (or the interface's). */
export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.role !== "merchant") return new Response("Sign in first", { status: 401 });
  const asked = new URL(req.url).searchParams.get("lang");
  const lang = asked === "fr" || asked === "ar" ? asked : "en";
  return new Response(templateCsv(lang), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="masar-orders-${lang}.csv"` },
  });
}
