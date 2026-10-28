"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

export function ExpandingTextarea({
  value,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      value={value}
      rows={3}
      className={`min-h-[5.5rem] resize-none overflow-hidden ${className}`}
    />
  );
}
