// "On this page" section nav for the results page (CSF site pattern): sticky left column from 1100px, a disclosure on smaller screens.
// On phones it is a sticky bar at the top with a one-tap "Start here" link; its list opens over the content.
// Links are grouped by report layer (tab panel); following a link into a hidden layer opens that layer first.
import { $$, esc } from "./dom";
import { icon } from "./icons";
import { PHONE } from "./report-ui";

const SECTIONS: [string, string][] = [
  ["truth-title", "What's true about you"],
  ["learned-title", "What we learned about you"],
  ["focus-title", "Start here"],
  ["roadmap-title", "Your 12-week roadmap"],
  ["coach-title", "Ask about your report"],
  ["support-title", "Ask for support"],
  ["peers-title", "Connect with similar groups"],
  ["explore-title", "Explore any area"],
  ["stages-title", "Where you are today"],
  ["progress-title", "Progress"],
  ["strengths-title", "Strengths"],
  ["plan-title", "30 / 60 / 90 day plan"],
  ["conversation-title", "Conversation guide"],
  ["gaps-title", "All growth priorities"],
  ["sources-title", "Sources"],
];

const WIDE = window.matchMedia("(min-width: 1100px)");
let observer: IntersectionObserver | null = null;
let bottomObserver: IntersectionObserver | null = null;
let onWideChange: (() => void) | null = null;
let tocDetails: HTMLDetailsElement | null = null;
// Phones: a tap outside the open list closes it, like any menu.
document.addEventListener("click", (e) => {
  if (PHONE.matches && tocDetails?.open && !tocDetails.contains(e.target as Node)) tocDetails.open = false;
});

/** Fills `nav` with links to the sections present in `content` and highlights the current one (aria-current="true"). */
export function wireToc(nav: HTMLElement, content: HTMLElement) {
  observer?.disconnect();
  if (onWideChange) WIDE.removeEventListener("change", onWideChange);
  const present = SECTIONS.filter(([id]) => content.querySelector(`#${id}`));
  if (present.length < 2) { nav.hidden = true; return; }
  // Group consecutive links by their layer (tab panel title); sections outside any layer get no group label.
  const groups: { title: string; items: [string, string][] }[] = [];
  for (const item of present) {
    const title = content.querySelector(`#${item[0]}`)!.closest<HTMLElement>("[data-layer-title]")?.dataset.layerTitle ?? "";
    if (groups.at(-1)?.title === title) groups.at(-1)!.items.push(item);
    else groups.push({ title, items: [item] });
  }
  const links = (items: [string, string][], cls = "") => items.map(([id, label]) => `<li${cls ? ` class="${cls}"` : ""}><a href="#${id}" data-toc="${id}">${esc(label)}</a></li>`).join("");
  nav.innerHTML = `<details class="toc__details">
      <summary>${icon("list-checks")}<span>On this page</span>${icon("chevron-down", "about-card__chevron")}</summary>
      <ol class="toc__list" role="list">${groups.map((g) => g.title && g.items.some(([, label]) => label !== g.title)
        ? `<li class="toc__group"><span class="toc__group-title">${esc(g.title)}</span><ol class="toc__list" role="list">${links(g.items)}</ol></li>`
        : links(g.items, g.title ? "toc__solo" : "")).join("")}</ol>
    </details>${present.some(([id]) => id === "focus-title") ? `<a class="btn btn-secondary btn-sm toc__jump" href="#focus-title" data-toc="focus-title">${icon("target")}<span>Start here</span></a>` : ""}`;
  const details = nav.querySelector<HTMLDetailsElement>("details")!;
  tocDetails = details;
  onWideChange = () => { details.open = WIDE.matches; };
  onWideChange();
  WIDE.addEventListener("change", onWideChange);
  nav.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || WIDE.matches || !details.open) return;
    details.open = false;
    details.querySelector("summary")!.focus();
  });

  // Scroll to the heading and move focus there too, so screen reader and keyboard users land in the section.
  nav.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-toc]");
    if (!a) return;
    e.preventDefault();
    const h = document.getElementById(a.dataset.toc!);
    if (!h) return;
    const panel = h.closest<HTMLElement>('[role="tabpanel"]');
    if (panel?.hidden) document.getElementById(panel.getAttribute("aria-labelledby")!)?.click();
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.scrollIntoView({ block: "start" });
    h.focus({ preventScroll: true });
    if (!WIDE.matches) details.open = false;
  });

  const anchors = $$<HTMLAnchorElement>(".toc__list a[data-toc]", nav);
  const headings = present.map(([id]) => content.querySelector<HTMLElement>(`#${id}`)!);
  const update = () => {
    // Current = last visible heading above the top 30% of the viewport (or the first visible one); hidden layers are skipped.
    const visible = headings.filter((h) => h.offsetParent !== null);
    if (!visible.length) return;
    const line = window.innerHeight * 0.3;
    let current = visible[0];
    for (const h of visible) if (h.getBoundingClientRect().top <= line) current = h;
    // At the very bottom the last short sections never reach the line; select the last one.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = visible[visible.length - 1];
    anchors.forEach((a) => {
      if (a.dataset.toc === current.id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };
  // Observe whole sections (they tile the page), so even a long jump makes the section under the 30% line fire a callback;
  // the footer entering view covers reaching the bottom of the page. Switching layers re-runs the update.
  observer = new IntersectionObserver(update, { rootMargin: "0px 0px -70% 0px" });
  headings.forEach((h) => observer!.observe(h.closest("section") ?? h));
  bottomObserver?.disconnect();
  bottomObserver = new IntersectionObserver(update, { threshold: [0, 1] });
  const footer = document.querySelector(".site-footer");
  if (footer) bottomObserver.observe(footer);
  update();
  content.addEventListener("oci:layer", () => requestAnimationFrame(update));
}
