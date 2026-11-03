// "On this page" section nav for the results page (CSF site pattern): sticky left column from 1100px, a disclosure on smaller screens.
import { $$, esc } from "./dom";
import { icon } from "./icons";

const SECTIONS: [string, string][] = [
  ["truth-title", "What's true about you"],
  ["focus-title", "Start here"],
  ["coach-title", "Ask about your report"],
  ["stages-title", "Where you are today"],
  ["progress-title", "Progress"],
  ["plan-title", "30 / 60 / 90 day plan"],
  ["strengths-title", "Strengths"],
  ["conversation-title", "Conversation guide"],
  ["gaps-title", "All growth priorities"],
  ["support-title", "Ask for support"],
  ["sources-title", "Sources"],
];

const WIDE = window.matchMedia("(min-width: 1100px)");
let observer: IntersectionObserver | null = null;
let bottomObserver: IntersectionObserver | null = null;
let onWideChange: (() => void) | null = null;

/** Fills `nav` with links to the sections present in `content` and highlights the current one (aria-current="true"). */
export function wireToc(nav: HTMLElement, content: HTMLElement) {
  observer?.disconnect();
  if (onWideChange) WIDE.removeEventListener("change", onWideChange);
  const present = SECTIONS.filter(([id]) => content.querySelector(`#${id}`));
  if (present.length < 2) { nav.hidden = true; return; }
  nav.innerHTML = `<details class="toc__details">
      <summary>${icon("list-checks")}<span>On this page</span>${icon("chevron-down", "about-card__chevron")}</summary>
      <ol class="toc__list" role="list">${present.map(([id, label]) => `<li><a href="#${id}" data-toc="${id}">${esc(label)}</a></li>`).join("")}</ol>
    </details>`;
  const details = nav.querySelector<HTMLDetailsElement>("details")!;
  onWideChange = () => { details.open = WIDE.matches; };
  onWideChange();
  WIDE.addEventListener("change", onWideChange);

  // Scroll to the heading and move focus there too, so screen reader and keyboard users land in the section.
  nav.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-toc]");
    if (!a) return;
    e.preventDefault();
    const h = document.getElementById(a.dataset.toc!);
    if (!h) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
    if (!WIDE.matches) details.open = false;
  });

  const links = $$<HTMLAnchorElement>("a[data-toc]", nav);
  const headings = present.map(([id]) => content.querySelector<HTMLElement>(`#${id}`)!);
  const update = () => {
    // Current = last heading above the top 30% of the viewport (or the first one).
    const line = window.innerHeight * 0.3;
    let current = headings[0];
    for (const h of headings) if (h.getBoundingClientRect().top <= line) current = h;
    // At the very bottom the last short sections never reach the line; select the last one.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = headings[headings.length - 1];
    links.forEach((a) => {
      if (a.dataset.toc === current.id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };
  // Observe whole sections (they tile the page), so even a long jump makes the section under the 30% line fire a callback;
  // the footer entering view covers reaching the bottom of the page.
  observer = new IntersectionObserver(update, { rootMargin: "0px 0px -70% 0px" });
  headings.forEach((h) => observer!.observe(h.closest("section") ?? h));
  bottomObserver?.disconnect();
  bottomObserver = new IntersectionObserver(update, { threshold: [0, 1] });
  const footer = document.querySelector(".site-footer");
  if (footer) bottomObserver.observe(footer);
  update();
}
