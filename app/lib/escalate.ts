// app/lib/escalate.ts — the Gorgias handoff (simulated until API creds) +
// Slack alert + local escalation log. Every redirect lands here so nothing
// escalated is ever lost.
import { promises as fs } from "fs";
import path from "path";

export const isMock = () => process.env.ORDERSENSE_MOCK === "1";

export interface Escalation {
  reason: string;
  summary: string;
  source: "guardrail" | "model";
  orderNumber?: string;
  at: string;
}

export async function escalate(e: Omit<Escalation, "at">): Promise<string> {
  const entry: Escalation = { ...e, at: new Date().toISOString() };

  const out = path.join(process.cwd(), "data", "out");
  await fs.mkdir(out, { recursive: true });
  const file = path.join(out, "escalations.json");
  let list: Escalation[] = [];
  try {
    list = JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    /* first write */
  }
  list.push(entry);
  await fs.writeFile(file, JSON.stringify(list, null, 2));

  // Gorgias: create ticket with context (simulated; real API in v2)
  const gorgias = isMock() ? "[MOCK] Gorgias ticket would be created (tag: ai-escalated)" : "gorgias-api-not-wired";

  // Slack #cx-escalations
  if (!isMock() && process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *CX escalation* — ${e.reason}\n${e.summary}${e.orderNumber ? `\nOrder: ${e.orderNumber}` : ""}`,
      }),
    }).catch((err) => console.error("Slack error:", err));
  }

  return gorgias;
}
