import { Plus } from "lucide-react";

/** Questions as native disclosure widgets: work without JavaScript, one open at a time. */
export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map(([q, a]) => (
        <details key={q} name="faq" className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-start text-[17px] font-medium [&::-webkit-details-marker]:hidden">
            {q}
            <Plus size={20} className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" aria-hidden />
          </summary>
          <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-ink-2">{a}</p>
        </details>
      ))}
    </div>
  );
}
