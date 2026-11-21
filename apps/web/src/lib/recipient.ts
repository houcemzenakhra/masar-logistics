import { cookies } from "next/headers";
import { verifyGrant } from "@/server/auth";

export const RECIPIENT_COOKIE = (tracking: string) => `masar_r_${tracking.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

/** The parcel this browser unlocked by typing the recipient's phone digits, if any. */
export async function recipientParcelId(tracking: string) {
  return verifyGrant((await cookies()).get(RECIPIENT_COOKIE(tracking))?.value, "recipient");
}
