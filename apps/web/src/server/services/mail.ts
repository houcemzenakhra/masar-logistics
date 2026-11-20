/**
 * Email through Resend when RESEND_API_KEY and MAIL_FROM are set. Without them, nothing is sent
 * and the caller falls back to text messages. Returns whether the email was accepted.
 */
export async function sendMail(m: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
