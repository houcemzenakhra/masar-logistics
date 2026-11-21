import { ShieldCheck } from "lucide-react";
import { createStaffAction, resetTwoStepAction, staffActiveAction, staffRoleAction } from "@/app/actions";
import { STAFF_HINT, STAFF_LABEL, STAFF_ROLES } from "@/lib/staff";
import { ActionForm, Submit } from "@/components/forms";
import { ResetLinkButton } from "@/components/reset-link";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { listHubs } from "@/server/services/directory";
import { listStaff } from "@/server/services/dispatch";

const ROLE = { admin: ["Operations", "neutral"], hub: ["Hub staff", "progress"], courier: ["Courier", "info"], merchant: ["Merchant", "neutral"] } as const;

export default async function Team() {
  const s = await requireStaff("settings");
  const db = await getDb();
  const [staff, hubs] = await Promise.all([listStaff(db), listHubs(db)]);
  return (
    <>
      <PageHeader title={t("Team")} subtitle={t("Couriers, hub staff and operations accounts. Deactivating an account blocks its sign-in without deleting its history.")} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <Table head={["Name", "Role", "Hub", "Status", ""]} empty={staff.length === 0}>
            {staff.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <Td className="whitespace-nowrap">
                  <p className="font-medium">{u.name}</p>
                  <p className="ltr text-[13px] text-muted">{u.email}</p>
                </Td>
                <Td>
                  <Badge tone={ROLE[u.role][1]}>{t(ROLE[u.role][0])}</Badge>
                  {u.role === "admin" && u.id !== s.userId && u.active ? (
                    <ActionForm action={staffRoleAction} className="mt-1.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="staffRole" defaultValue={u.staffRole} aria-label={t("Access")} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px]">
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(STAFF_LABEL[r])}</option>)}
                      </select>
                      <Submit size="sm" variant="ghost">{t("Save")}</Submit>
                    </ActionForm>
                  ) : (
                    u.role === "admin" && <p className="mt-1 text-[12px] text-muted">{t(STAFF_LABEL[u.staffRole])}</p>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{u.hub ? t(u.hub) : "—"}</Td>
                <Td>
                  {u.active ? <Badge tone="success">{t("Active")}</Badge> : <Badge>{t("Deactivated")}</Badge>}
                  {u.twoStep && <span className="mt-1 flex items-center gap-1 text-[12px] text-ok"><ShieldCheck size={13} /> {t("Two-step")}</span>}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    {u.active && <ResetLinkButton userId={u.id} />}
                    {u.twoStep && u.id !== s.userId && (
                      <ActionForm action={resetTwoStepAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Submit size="sm" variant="ghost">{t("Reset two-step")}</Submit>
                      </ActionForm>
                    )}
                    {u.id !== s.userId && (
                      <ActionForm action={staffActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                        <Submit size="sm" variant="ghost">{u.active ? t("Deactivate") : t("Reactivate")}</Submit>
                      </ActionForm>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card className="h-fit">
          <CardHeader title={t("Add a team member")} />
          <ActionForm action={createStaffAction} className="space-y-4 p-5">
            <Field label={t("Name")}><Input name="name" required autoComplete="off" /></Field>
            <Field label={t("Email")}><Input name="email" type="email" required autoComplete="off" dir="ltr" /></Field>
            <Field label={t("Mobile phone")}><Input name="phone" inputMode="tel" autoComplete="off" dir="ltr" /></Field>
            <Field label={t("Role")}>
              <Select name="role" defaultValue="courier">
                <option value="courier">{t("Courier")}</option>
                <option value="hub">{t("Hub staff")}</option>
                <option value="admin">{t("Operations")}</option>
              </Select>
            </Field>
            <Field label={t("Access, for operations accounts")}>
              <Select name="staffRole" defaultValue="owner">
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{t(STAFF_LABEL[r])}: {t(STAFF_HINT[r])}</option>)}
              </Select>
            </Field>
            <Field label={t("Hub")} hint={t("Not needed for operations accounts.")}>
              <Select name="hubId" defaultValue="">
                <option value="">—</option>
                {hubs.map((h) => <option key={h.id} value={h.id}>{t(h.name)}</option>)}
              </Select>
            </Field>
            <Field label={t("Temporary password")} hint={t("At least 8 characters.")}><Input name="password" type="text" required minLength={8} autoComplete="off" dir="ltr" /></Field>
            <Submit className="w-full">{t("Create account")}</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
