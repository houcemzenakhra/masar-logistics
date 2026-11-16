"use client";

import { createContext, startTransition, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "./i18n-client";

export type FormState = { error?: string; ok?: string } | undefined;
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

const Pending = createContext(false);

/** A form bound to a server action that shows the action's error or success message inline. */
export function ActionForm({ action, className, children }: { action: Action; className?: string; children: ReactNode }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form
      action={run}
      className={className}
      // Submitting by hand keeps what the person typed when the action returns an error:
      // a plain form action would reset every field.
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => run(fd));
      }}
    >
      <Pending value={pending}>{children}</Pending>
      {state?.error && (
        <p role="alert" className="mt-2 basis-full rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-2 basis-full rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok">
          {state.ok}
        </p>
      )}
    </form>
  );
}

const VARIANT = {
  primary: "bg-accent text-white hover:bg-accent-deep shadow-sm",
  dark: "bg-navy text-white hover:bg-navy-2",
  ghost: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-paper",
  danger: "bg-surface text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-soft",
};

export function Submit({
  children,
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT;
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const t = useT();
  const status = useFormStatus();
  const pending = useContext(Pending) || status.pending;
  const sz = size === "sm" ? "h-8 px-3 text-[13px]" : size === "lg" ? "h-12 px-5 text-[15px]" : "h-10 px-4 text-sm";
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:opacity-60 ${sz} ${VARIANT[variant]} ${className}`}
    >
      {pending ? t("Working…") : children}
    </button>
  );
}
