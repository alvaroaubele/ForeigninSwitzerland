"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDataset, ALL_FOREIGN } from "@/lib/data-context";
import { useI18n } from "@/lib/i18n";
import { fmtInt } from "@/lib/format";

/**
 * Which population the whole page is describing.
 *
 * Two hundred options make a scrolling menu useless, so this one is a
 * combobox: open, type a few letters, pick. Options are sorted by community
 * size (the latest SEM Switzerland-wide total) because "largest first" is the
 * order in which readers recognise names; the search field is what serves
 * everyone else. The all-foreigners default and the group entries sit pinned
 * at the top, above the country list.
 */
export function NationalityPicker() {
  const { nat, setNat, natIndex, switching } = useDataset();
  const { t, natName } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const { pinned, countries } = useMemo(() => {
    const pinnedCodes = [ALL_FOREIGN, "_EU_EFTA", "_THIRD"];
    const pinned = pinnedCodes
      .map((c) => natIndex.find((e) => e.code === c))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    const countries = natIndex
      .filter((e) => !e.code.startsWith("_"))
      .map((e) => ({ ...e, name: natName(e.code) }))
      .sort((a, b) => (b.semTotal ?? -1) - (a.semTotal ?? -1) || a.name.localeCompare(b.name));
    return { pinned, countries };
  }, [natIndex, natName]);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? countries.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle)
    : countries;

  const pick = (code: string) => {
    setNat(code);
    setOpen(false);
    setQ("");
  };

  return (
    <div className={`nat-picker ${switching ? "is-switching" : ""}`} ref={ref}>
      <button
        type="button"
        className="canton-trigger nat-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="canton-trigger-label">{t.natPicker.label}</span>
        <span className="canton-trigger-name">{natName(nat)}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M4 6.5 8 10.5 12 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="canton-menu nat-menu" role="listbox" aria-label={t.natPicker.pickerLabel}>
          <input
            ref={inputRef}
            className="nat-search"
            type="search"
            placeholder={t.natPicker.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown.length > 0) pick(shown[0].code);
            }}
          />
          {!needle &&
            pinned.map((e) => (
              <button
                key={e.code}
                role="option"
                aria-selected={e.code === nat}
                className={`canton-option ${e.code === nat ? "is-on" : ""} is-national`}
                onClick={() => pick(e.code)}
              >
                <span>{natName(e.code)}</span>
                {e.semTotal !== null && <span className="canton-option-code mono">{fmtInt(e.semTotal)}</span>}
              </button>
            ))}
          <div className="nat-menu-scroll">
            {shown.map((e) => (
              <button
                key={e.code}
                role="option"
                aria-selected={e.code === nat}
                className={`canton-option ${e.code === nat ? "is-on" : ""}`}
                onClick={() => pick(e.code)}
              >
                <span>{e.name}</span>
                {e.semTotal !== null && <span className="canton-option-code mono">{fmtInt(e.semTotal)}</span>}
              </button>
            ))}
            {shown.length === 0 && <div className="nat-empty">{t.natPicker.empty}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
