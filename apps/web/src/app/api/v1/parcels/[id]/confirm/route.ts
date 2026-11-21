import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { kickOutbox } from "@/lib/kick";
import { getDb } from "@/server/db";
import { answerConfirmation } from "@/server/services/returns";

const Body = z.object({ answer: z.enum(["yes", "no"]) });

/** Answers a confirmation request for the recipient, after a phone call. "no" cancels the order. */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const s = await auth(req, "merchant", "admin");
  const { answer } = Body.parse(await req.json());
  await answerConfirmation(await getDb(), (await ctx.params).id, answer === "yes", s);
  kickOutbox();
  return json({ ok: true, confirmation: answer === "yes" ? "confirmed" : "declined" });
});
