"use client";

import { createContext, useContext, type ReactNode } from "react";
import { translate, type Dict, type Locale } from "@/i18n/config";

const Ctx = createContext<{ locale: Locale; dict?: Dict }>({ locale: "en" });

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict?: Dict; children: ReactNode }) {
  return <Ctx value={{ locale, dict }}>{children}</Ctx>;
}

/** Translator for client components. */
export function useT() {
  const { dict } = useContext(Ctx);
  return (text: string, vars?: Record<string, string | number>) => translate(dict, text, vars);
}

export const useLocale = () => useContext(Ctx).locale;
