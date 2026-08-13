"use client";

import { useEffect } from "react";

export function LandingEffects() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".new-landing");
    if (!root) return;
    root.classList.add("effects-ready");

    const revealTargets = root.querySelectorAll<HTMLElement>(
      ".manifesto-main, .manifesto-card, .bento-services > header, .service-bento article, .booking-phone, .booking-story-copy, .team-showcase header, .team-type article, .plans-intro, .plan-stack article, .social-proof > *, .final-cta > *"
    );
    revealTargets.forEach((element) => element.classList.add("reveal-item"));

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px" });
    revealTargets.forEach((element) => observer.observe(element));

    const move = (event: PointerEvent) => {
      root.style.setProperty("--cursor-x", `${event.clientX}px`);
      root.style.setProperty("--cursor-y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      root.classList.remove("effects-ready");
    };
  }, []);

  return null;
}
