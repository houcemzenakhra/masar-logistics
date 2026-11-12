"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-xl bg-navy px-3 text-sm font-medium text-white hover:bg-navy-2">
      <Printer size={16} /> Print
    </button>
  );
}
