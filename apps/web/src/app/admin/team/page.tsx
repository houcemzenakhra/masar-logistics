import { createStaffAction, staffActiveAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ResetLinkButton } from "@/components/reset-link";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listHubs } from "@/server/services/directory";
import { listStaff } from "@/server/services/dispatch";

const ROLE = { admin: ["Operations", "neutral"], hub: ["Hub staff", "progress"], courier: ["Courier", "info"], merchant: ["Merchant", "neutral"] } as const;

export default async function Team() {
  const s = await requireRole("admin");
  const db = await getDb();
  const [staff, hubs] = await Promise.all([listStaff(db), listHubs(db)]);
  return (
    <>
      <PageHeader title={t("Team")} subtitle={t("Couriers, hub staff and operations accounts. Deactivating an account blocks its sign-in without deleting its history.")} />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <Table head={["Name", "Role", "Hub", "Status", ""]} empty={staff.length === 0}>
            {staff.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                <Td className="whitespace-nowrap">
                  <p className="font-medium">{u.name}</p>
                  <p className="ltr text-[13px] text-muted">{u.email}</p>
                </Td>
                <Td><Badge tone={ROLE[u.role][1]}>{t(ROLE[u.role][0])}</Badge></Td>
                <Td className="whitespace-nowrap">{u.hub ? t(u.hub) : "—"}</Td>
                <Td>{u.active ? <Badge tone="success">{t("Active")}</Badge> : <Badge>{t("Deactivated")}</Badge>}</Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    {u.active && <ResetLinkButton userId={u.id} />}
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
