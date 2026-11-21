import { z } from "zod";
import { apiSession } from "@/lib/session";
import type { Session } from "@/server/auth";
import type { Role } from "@/server/domain/state";
import { DomainError } from "@/server/services/parcels";
import { DeskError } from "@/server/services/desks";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const fail = (status: number, error: string) => Response.json({ error }, { status });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function auth(req: Request, ...roles: Role[]): Promise<Session> {
  const s = await apiSession(req);
  if (!s) throw new HttpError(401, "Sign in first");
  if (roles.length && !roles.includes(s.role)) throw new HttpError(403, "Not allowed for your role");
  return s;
}

export const notFound = (what = "Not found") => new HttpError(404, what);

/** Wraps a route handler so expected failures become JSON errors with the right status. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      if (e instanceof DomainError || e instanceof DeskError) return fail(422, e.message);
      if (e instanceof z.ZodError) return fail(400, e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      if (e instanceof SyntaxError) return fail(400, "Body must be JSON");
      console.error(e);
      return fail(500, "Something went wrong on our side");
    }
  };
}
