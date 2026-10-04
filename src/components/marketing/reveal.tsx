"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Dependency-free scroll-triggered reveal - a single shared IntersectionObserver
// per mount point, not a library (Framer Motion/GSAP would be a heavyweight
// import for "fade a div in once"). Respects prefers-reduced-motion via the
// CSS transition itself (globals.css), not a JS check, so it degrades safely
// even if this component's JS fails to hydrate for any reason - the content
// is already in the DOM and visible, just not yet animated in.
export function Reveal({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "reveal-visible" : ""} ${className ?? ""}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
