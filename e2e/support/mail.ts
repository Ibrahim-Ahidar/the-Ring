import { MAIL_URL } from "./env";

// Polls the local Supabase mail catcher (Mailpit) for the latest 6-digit code sent to the address.
export async function latestEmailCode(
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await fetch(
      `${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    if (list.ok) {
      const { messages = [] } = (await list.json()) as {
        messages?: { ID: string }[];
      };
      if (messages[0]) {
        const msg = await fetch(`${MAIL_URL}/api/v1/message/${messages[0].ID}`);
        const body = (await msg.json()) as { Text?: string; HTML?: string };
        const code = /\b(\d{6})\b/.exec(`${body.Text ?? ""} ${body.HTML ?? ""}`);
        if (code) return code[1];
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No confirmation code arrived for ${email}`);
}
