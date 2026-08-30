// app/lib/shop.ts — mock Shopify order lookup + the guardrails that make
// this agent trustworthy: flagged orders are never answered by the model,
// and "is this late?" gets a deterministic don't-panic verdict.
import { promises as fs } from "fs";
import path from "path";

export interface Order {
  orderNumber: string;
  email: string;
  name: string;
  status: string;
  carrier: string | null;
  trackingState: string | null;
  placedAt: string;
  country: string;
  items: string[];
  total: string;
  flags: string[];
}

const EU = new Set(["DE", "FR", "NL", "BE"]);
const PANIC_DAYS_EU = 5;
const PANIC_DAYS_INTL = 12;

export async function findOrder(text: string): Promise<Order | null> {
  const raw = JSON.parse(
    await fs.readFile(path.join(process.cwd(), "data", "orders.json"), "utf-8"),
  ) as { orders: Order[] };

  const orderNo = text.match(/LA-\d{4,6}/i)?.[0]?.toUpperCase();
  if (orderNo) return raw.orders.find((o) => o.orderNumber === orderNo) ?? null;

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase();
  if (email) return raw.orders.find((o) => o.email.toLowerCase() === email) ?? null;

  return null;
}

function businessDaysSince(iso: string): number {
  let days = 0;
  const d = new Date(iso);
  const now = new Date();
  while (d < now) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days++;
  }
  return days;
}

// The model never sees flagged orders — this check runs BEFORE any AI call.
export function guardrailBlock(order: Order): string | null {
  if (order.flags.includes("fraud_risk")) return "order flagged fraud_risk";
  if (order.flags.includes("refunded")) return "order already refunded";
  if (order.status === "cancelled") return "order cancelled";
  return null;
}

export function orderContext(order: Order): string {
  const elapsed = businessDaysSince(order.placedAt);
  const threshold = EU.has(order.country) ? PANIC_DAYS_EU : PANIC_DAYS_INTL;
  const verdict =
    order.status === "delivered"
      ? "Delivered. If the customer says it did not arrive, redirect to a human agent (delivery dispute)."
      : elapsed <= threshold
        ? `Within the normal window (${elapsed}/${threshold} business days) — reassure, no escalation needed.`
        : `Outside the normal window (${elapsed}/${threshold} business days) — apologize and offer to have the team follow up.`;

  return [
    `ORDER CONTEXT (verified from the store, safe to share with this customer):`,
    `Order ${order.orderNumber} — ${order.name}, ${order.country}`,
    `Items: ${order.items.join("; ")} · Total ${order.total}`,
    `Status: ${order.status}${order.trackingState ? ` (${order.carrier}: ${order.trackingState})` : ""}`,
    `Placed: ${order.placedAt}`,
    `Timing verdict: ${verdict}`,
  ].join("\n");
}
