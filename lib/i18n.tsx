"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICTS, NUMBER_LOCALE, type Dict, type Locale } from "./dict";
import { setFormatLocale } from "./format";
import { setModelLocale } from "./model";
import { cantonName } from "./selectors";

const LOCALES: Locale[] = ["en", "es", "de", "fr"];

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: Dict;
  /** Canton display name: cantons keep their endonyms; "CH" localises. */
  cName: (code: string) => string;
  /**
   * Nationality display name. ISO codes localise through Intl.DisplayNames —
   * no hand-kept 200×4 translation table — and the pseudo-codes (_ALL, the
   * stateless/unknown groups) come from the dictionary.
   */
  natName: (code: string) => string;
}

const I18nContext = createContext<I18nState>({
  locale: "en",
  setLocale: () => {},
  t: DICTS.en,
  cName: cantonName,
  natName: (code) => code,
});

/**
 * Applies a locale everywhere it matters, in one place: the shared label maps
 * (mutated in place so the dozens of existing call sites keep working), the
 * number/date locale, and the <html lang>. Must run before the state update
 * that re-renders the tree, so the render pass reads the new labels.
 */
function applyLocale(l: Locale): void {
  setFormatLocale(NUMBER_LOCALE[l], DICTS[l].dims, DICTS[l].values, DICTS[l].metrics);
  setModelLocale(DICTS[l].states.label, DICTS[l].states.desc);
  try {
    document.documentElement.lang = l;
  } catch {
    /* server render */
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Starts as English to match the prerendered HTML; the real preference is
  // applied right after hydration. A one-frame flash of English beats a
  // hydration mismatch.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    let initial: Locale | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("lang");
      if (fromUrl && (LOCALES as string[]).includes(fromUrl)) initial = fromUrl as Locale;
      if (!initial) {
        const stored = localStorage.getItem("lang");
        if (stored && (LOCALES as string[]).includes(stored)) initial = stored as Locale;
      }
      if (!initial) {
        const nav = navigator.language.slice(0, 2).toLowerCase();
        if ((LOCALES as string[]).includes(nav)) initial = nav as Locale;
      }
    } catch {
      /* no browser context */
    }
    if (initial && initial !== "en") {
      applyLocale(initial);
      setLocaleState(initial);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    applyLocale(l);
    setLocaleState(l);
    try {
      localStorage.setItem("lang", l);
      const url = new URL(window.location.href);
      if (l === "en") url.searchParams.delete("lang");
      else url.searchParams.set("lang", l);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* choice just does not persist */
    }
  }, []);

  const t = DICTS[locale];
  const cName = useCallback(
    (code: string) => (code === "CH" ? DICTS[locale].values.CH : cantonName(code)),
    [locale],
  );
  const natName = useCallback(
    (code: string) => {
      const special = DICTS[locale].nats[code as keyof Dict["nats"]];
      if (special) return special;
      try {
        return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t, cName, natName }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  return useContext(I18nContext);
}

export { LOCALES };
