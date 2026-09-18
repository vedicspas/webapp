"use client";

import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";

const box =
  "flex w-full overflow-hidden rounded-2xl border border-veda-200 bg-white focus-within:border-veda-500 focus-within:ring-2 focus-within:ring-veda-200";
const affix =
  "flex shrink-0 items-center bg-veda-50 px-3 text-sm font-medium text-veda-800";
const field =
  "min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-veda-900 outline-none";

export function AffixedField({
  prefix,
  suffix,
  children,
}: {
  prefix?: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <div className={box}>
      {prefix ? <span className={`${affix} border-r border-veda-200`}>{prefix}</span> : null}
      {children}
      {suffix ? <span className={`${affix} border-l border-veda-200`}>{suffix}</span> : null}
    </div>
  );
}

export function sanitizeDollarText(raw: string): string {
  let s = raw.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, "")}`;
    const [whole, frac = ""] = s.split(".");
    s = `${whole}.${frac.slice(0, 2)}`;
  }
  return s;
}

export function dollarsToMinor(text: string): number {
  if (!text || text === ".") return 0;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function minorToDollars(minor: number): string {
  return (Number(minor) / 100).toFixed(2);
}

export function DollarInput({
  valueMinor,
  onChangeMinor,
  placeholder = "0.00",
  ...rest
}: {
  valueMinor: number;
  onChangeMinor: (minor: number) => void;
  placeholder?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => minorToDollars(valueMinor));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(minorToDollars(valueMinor));
  }, [valueMinor, focused]);

  return (
    <AffixedField prefix="USD">
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={field}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          const minor = dollarsToMinor(text);
          onChangeMinor(minor);
          setText(minorToDollars(minor));
        }}
        onChange={(e) => {
          const next = sanitizeDollarText(e.target.value);
          setText(next);
          onChangeMinor(dollarsToMinor(next));
        }}
      />
    </AffixedField>
  );
}

export function PostfixInput({
  suffix,
  value,
  onChangeValue,
  integer = true,
  ...rest
}: {
  suffix: string;
  value: number | null;
  onChangeValue: (n: number | null) => void;
  integer?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <AffixedField suffix={suffix}>
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={field}
        value={value ?? ""}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const raw = integer ? e.target.value.replace(/\D/g, "") : e.target.value;
          if (raw === "") {
            onChangeValue(null);
            return;
          }
          const n = Number(raw);
          onChangeValue(Number.isFinite(n) ? n : null);
        }}
      />
    </AffixedField>
  );
}
