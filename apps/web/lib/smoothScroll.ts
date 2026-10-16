/** Slow in-page scroll without touching the URL hash. */
export function easeScrollTo(el: HTMLElement, duration = 850): void {
  const headerOffset = 88;
  const target = el.getBoundingClientRect().top + window.scrollY - headerOffset;
  const start = window.scrollY;
  const change = target - start;
  if (Math.abs(change) < 4) return;
  const started = performance.now();
  function step(now: number) {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - t) ** 3;
    window.scrollTo(0, start + change * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
