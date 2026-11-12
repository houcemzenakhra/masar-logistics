import { createParcelAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listWilayas } from "@/server/services/directory";

export default async function NewOrder() {
  await requireRole("merchant");
  const wilayas = await listWilayas(await getDb());
  return (
    <>
      <PageHeader title="New order" subtitle="The delivery fee is calculated from the destination and weight, and taken from the cash collected." />
      <Card className="max-w-2xl p-6">
        <ActionForm action={createParcelAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Recipient name"><Input name="recipientName" required autoComplete="off" /></Field>
          <Field label="Recipient phone"><Input name="recipientPhone" required inputMode="tel" placeholder="0550 12 34 56" /></Field>
          <Field label="Wilaya">
            <Select name="destWilayaId" required defaultValue="">
              <option value="" disabled>Choose wilaya</option>
              {wilayas.map((w) => <option key={w.id} value={w.id}>{String(w.id).padStart(2, "0")} · {w.name}</option>)}
            </Select>
          </Field>
          <Field label="Commune"><Input name="commune" required /></Field>
          <div className="sm:col-span-2">
            <Field label="Address" hint="Street, building, or a landmark the courier can find."><Input name="address" required /></Field>
          </div>
          <Field label="Cash to collect (DZD)" hint="Enter 0 if the order is already paid."><Input name="codAmount" required inputMode="numeric" defaultValue={0} className="tnum" /></Field>
          <Field label="Weight (kg)"><Input name="weightKg" required type="number" min={0.1} max={70} step={0.1} defaultValue={1} className="tnum" /></Field>
          <div className="sm:col-span-2">
            <Field label="Contents (optional)"><Input name="description" maxLength={120} placeholder="e.g. Sneakers, size 42" /></Field>
          </div>
          <div className="sm:col-span-2"><Submit>Create order</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
