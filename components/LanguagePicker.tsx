"use client";
import { useI18n, LOCALES } from "@/lib/i18n";
import type { Locale } from "@/lib/dict";

const NAMES: Record<Locale, string> = { en: "English", es: "Español", de: "Deutsch", fr: "Français" };

/** Four languages, one small segmented control beside the theme switch. */
export function LanguagePicker() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="lang-picker" role="group" aria-label="Language">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-btn ${l === locale ? "is-on" : ""}`}
          onClick={() => setLocale(l)}
          aria-pressed={l === locale}
          title={NAMES[l]}
          lang={l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
