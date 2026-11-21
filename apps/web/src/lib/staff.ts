/** What each kind of operations staff works on. Hub, courier and merchant accounts are separate roles. */
export const STAFF_ROLES = ["owner", "finance", "dispatch", "support"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type Area = "overview" | "parcels" | "analytics" | "dispatch" | "finance" | "merchants" | "claims" | "messages" | "settings";

const AREAS: Record<StaffRole, readonly Area[]> = {
  owner: ["overview", "parcels", "analytics", "dispatch", "finance", "merchants", "claims", "messages", "settings"],
  finance: ["overview", "parcels", "analytics", "finance", "merchants", "claims"],
  dispatch: ["overview", "parcels", "analytics", "dispatch"],
  support: ["overview", "parcels", "merchants", "claims", "messages"],
};

export const STAFF_LABEL: Record<StaffRole, string> = { owner: "Full access", finance: "Finance", dispatch: "Dispatch", support: "Support" };
export const STAFF_HINT: Record<StaffRole, string> = {
  owner: "Everything, including team, prices and settings.",
  finance: "Payouts, cash checks, courier pay, claims and merchants.",
  dispatch: "Parcels, dispatch, hub floor, linehaul, stop desks and couriers.",
  support: "Parcels, recipients' requests, claims, merchants and text messages.",
};

export const canUse = (staffRole: StaffRole | undefined, area: Area) => AREAS[staffRole ?? "owner"].includes(area);

/** The area of an operations page, from its address. Unknown pages need full access. */
export function areaOf(path: string): Area {
  const rules: [RegExp, Area][] = [
    [/^\/admin\/?$/, "overview"],
    [/^\/admin\/parcels/, "parcels"],
    [/^\/admin\/analytics/, "analytics"],
    [/^\/admin\/(dispatch|live|scan|sorting|linehaul|desks|couriers)/, "dispatch"],
    [/^\/admin\/finance/, "finance"],
    [/^\/admin\/merchants/, "merchants"],
    [/^\/admin\/claims/, "claims"],
    [/^\/admin\/sms/, "messages"],
  ];
  return rules.find(([r]) => r.test(path))?.[1] ?? "settings";
}
