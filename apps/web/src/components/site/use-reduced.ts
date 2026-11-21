"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/**
 * Whether the visitor asked for less motion. False while the server renders and during
 * hydration, so the first client render matches the server HTML; then the real value.
 */
export const useReduced = () => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
