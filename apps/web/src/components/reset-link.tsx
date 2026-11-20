import { KeyRound } from "lucide-react";
import { resetLinkAction } from "@/app/actions";
import { t } from "@/lib/i18n";
import { ActionForm, Submit } from "./forms";

/** Makes a one-time password link for an account; shown to the admin and texted to the account's phone. */
export function ResetLinkButton({ userId }: { userId: string }) {
  return (
    <ActionForm action={resetLinkAction} className="max-w-md [&_p[role=status]]:break-all">
      <input type="hidden" name="userId" value={userId} />
      <Submit size="sm" variant="ghost"><KeyRound size={14} /> {t("Reset link")}</Submit>
    </ActionForm>
  );
}
