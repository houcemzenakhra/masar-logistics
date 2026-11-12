/** Small daily-volume bar chart. Values are labelled on hover and summarised for screen readers. */
export function Bars({ data }: { data: { day: string; n: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <figure>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${total} orders over the last ${data.length} days`}>
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div className="w-full rounded-t-md bg-accent/85 transition-colors group-hover:bg-accent-deep" style={{ height: `${Math.max(3, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.25 }} />
            <span className="tnum pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] text-white group-hover:block">{d.n}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-[11px] text-muted">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data.at(-1)?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}
