import { z } from "zod";
import { fail, json, route } from "@/lib/api";
import { login } from "@/server/auth";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = route(async (req) => {
  const { email, password } = Body.parse(await req.json());
  const res = await login(email, password);
  if (!res) return fail(401, "Wrong email or password");
  return json({ token: res.token, user: res.session });
});
