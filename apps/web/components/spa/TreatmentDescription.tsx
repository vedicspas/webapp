"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { treatmentDescriptionParagraphs } from "@/lib/format";

export function TreatmentDescription({ text }: { text: string }) {
  const paragraphs = treatmentDescriptionParagraphs(text);
  const clampRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [text]);

  useLayoutEffect(() => {
    const el = clampRef.current;
    if (!el || expanded) return;

    const measure = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded, paragraphs]);

  if (paragraphs.length === 0) return null;

  return (
    <div className="mt-3 text-sm leading-relaxed text-foreground/70">
      {expanded ? (
        <div>
          {paragraphs.map((p, i) => (
            <p key={i} className={i === 0 ? undefined : "mt-2"}>
              {p}
              {overflows && i === paragraphs.length - 1 ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="italic text-foreground/60 underline underline-offset-2"
                    onClick={() => setExpanded(false)}
                  >
                    Read less
                  </button>
                </>
              ) : null}
            </p>
          ))}
        </div>
      ) : (
        <div className="relative">
          <p ref={clampRef} className="line-clamp-2">
            {paragraphs.join(" ")}
          </p>
          {overflows ? (
            <button
              type="button"
              className="absolute bottom-0 right-0 bg-gradient-to-l from-white from-[2.75rem] to-transparent pl-24 italic text-foreground/60 underline underline-offset-2"
              onClick={() => setExpanded(true)}
            >
              Read more
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
