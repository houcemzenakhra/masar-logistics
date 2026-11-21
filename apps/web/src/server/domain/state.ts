/** The parcel lifecycle. Pure data and functions: no database, safe to import anywhere. */

export const STATUSES = [
  "created",
  "pickup_assigned",
  "picked_up",
  "at_origin_hub",
  "in_transit",
  "at_destination_hub",
  "out_for_delivery",
  "ready_for_pickup",
  "delivered",
  "attempt_failed",
  "return_initiated",
  "returned",
  "cancelled",
  "lost",
] as const;

export type Status = (typeof STATUSES)[number];
export type Role = "admin" | "hub" | "courier" | "merchant";

export const MAX_ATTEMPTS = 3;

export const STATUS_LABEL: Record<Status, string> = {
  created: "Created",
  pickup_assigned: "Pickup assigned",
  picked_up: "Picked up",
  at_origin_hub: "At origin hub",
  in_transit: "In transit",
  at_destination_hub: "At destination hub",
  out_for_delivery: "Out for delivery",
  ready_for_pickup: "Ready at stop desk",
  delivered: "Delivered",
  attempt_failed: "Attempt failed",
  return_initiated: "Return initiated",
  returned: "Returned to merchant",
  cancelled: "Cancelled",
  lost: "Lost",
};

export type Tone = "neutral" | "info" | "progress" | "success" | "warn" | "danger";

export const STATUS_TONE: Record<Status, Tone> = {
  created: "neutral",
  pickup_assigned: "info",
  picked_up: "info",
  at_origin_hub: "progress",
  in_transit: "progress",
  at_destination_hub: "progress",
  out_for_delivery: "info",
  ready_for_pickup: "info",
  delivered: "success",
  attempt_failed: "warn",
  return_initiated: "warn",
  returned: "neutral",
  cancelled: "neutral",
  lost: "danger",
};

/** from -> to -> roles allowed to perform it */
const T: Partial<Record<Status, Partial<Record<Status, Role[]>>>> = {
  created: { pickup_assigned: ["admin"], cancelled: ["admin", "merchant"] },
  pickup_assigned: { picked_up: ["courier", "admin"], created: ["admin"], cancelled: ["admin"] },
  picked_up: { at_origin_hub: ["hub", "admin"] },
  at_origin_hub: { in_transit: ["hub", "admin"], out_for_delivery: ["admin", "hub"], ready_for_pickup: ["hub", "admin"] },
  in_transit: { at_destination_hub: ["hub", "admin"] },
  at_destination_hub: { out_for_delivery: ["admin", "hub"], ready_for_pickup: ["hub", "admin"] },
  ready_for_pickup: { delivered: ["hub", "admin"], return_initiated: ["hub", "admin"] },
  out_for_delivery: { delivered: ["courier", "admin"], attempt_failed: ["courier", "admin"] },
  attempt_failed: { out_for_delivery: ["admin", "hub"], return_initiated: ["admin"] },
  return_initiated: { returned: ["hub", "admin"] },
};

export const TERMINAL: Status[] = ["delivered", "returned", "cancelled", "lost"];
export const isTerminal = (s: Status) => TERMINAL.includes(s);

export function nextStatuses(from: Status, role: Role): Status[] {
  const out = Object.entries(T[from] ?? {})
    .filter(([, roles]) => roles!.includes(role))
    .map(([to]) => to as Status);
  if (role === "admin" && !isTerminal(from)) out.push("lost");
  return out;
}

export function canTransition(from: Status, to: Status, role: Role): boolean {
  return nextStatuses(from, role).includes(to);
}

/** The happy path, used to draw progress on tracking pages. */
export const MAIN_PATH: Status[] = [
  "created",
  "picked_up",
  "at_origin_hub",
  "in_transit",
  "at_destination_hub",
  "out_for_delivery",
  "delivered",
];

export function progressIndex(s: Status): number {
  if (s === "pickup_assigned") return 0;
  if (s === "attempt_failed" || s === "ready_for_pickup") return 5;
  const i = MAIN_PATH.indexOf(s);
  return i;
}
