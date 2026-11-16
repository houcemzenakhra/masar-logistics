"use client";

import { Printer } from "lucide-react";
import { useT } from "./i18n-client";

export function PrintButton() {
  const t = useT();
  return (
    <button onClick={() => window.print()} className="no-print inline-flex h-9 items-center gap-2 rounded-xl bg-navy px-3 text-sm font-medium text-white hover:bg-navy-2">
      <Printer size={16} /> {t("Print")}
    </button>
  );
}
