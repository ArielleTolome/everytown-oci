// Read-aloud (v0.9): "Listen" buttons ([data-listen="<section>"]) play that report section as Amazon Polly audio from
// GET /api/assessments/<id>/audio/<section>, through one shared <audio> element in a small player under the section heading.
import { $$, announce, esc } from "./dom";
import { icon } from "./icons";

const SPEEDS = [1, 1.25, 0.85];
let speed = 0;
let audio: HTMLAudioElement | null = null;
let player: HTMLElement | null = null;
let active: HTMLButtonElement | null = null;

const sectionName = (btn: HTMLButtonElement) => btn.closest(".section-head")?.querySelector("h2")?.textContent?.trim() || "this section";

function setStatus(html: string) {
  const el = player?.querySelector<HTMLElement>(".listen-player__status");
  if (el) el.innerHTML = html;
}

/** Stops playback and removes the player; focus returns to the section's Listen button when the player had it. */
function stop(restoreFocus = false) {
  const btn = active;
  audio?.pause();
  audio?.removeAttribute("src");
  audio?.load();
  player?.remove();
  active?.setAttribute("aria-pressed", "false");
  active = null;
  if (restoreFocus) btn?.focus();
}

function buildPlayer(): HTMLElement {
  const el = document.createElement("div");
  el.className = "listen-player";
  el.setAttribute("role", "group");
  el.innerHTML = `<p class="listen-player__status"></p>
    <audio class="listen-player__audio" controls preload="none"></audio>
    <div class="listen-player__controls">
      <button type="button" class="btn btn-secondary btn-sm" data-player="speed">${icon("clock")}<span>Speed: ${SPEEDS[speed]}x</span></button>
      <button type="button" class="btn btn-secondary btn-sm" data-player="stop">${icon("stop")}<span>Stop</span></button>
    </div>`;
  audio = el.querySelector("audio")!;
  audio.addEventListener("playing", () => {
    setStatus(`${icon("volume")}<span>Playing: ${esc(active ? sectionName(active) : "")}</span>`);
    if (active) announce(`Playing ${sectionName(active)}`);
  });
  audio.addEventListener("pause", () => { if (active && !audio!.ended && audio!.src) setStatus(`${icon("circle")}<span>Paused</span>`); });
  audio.addEventListener("ended", () => { setStatus(`${icon("circle-check")}<span>Finished</span>`); });
  audio.addEventListener("error", () => {
    if (!audio!.getAttribute("src")) return; // our own stop() clears the source
    setStatus(`${icon("alert")}<span>We could not play this audio. Please try again.</span>`);
    announce("We could not play this audio. Please try again.");
  });
  el.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-player]");
    if (b?.dataset.player === "stop") stop(true);
    if (b?.dataset.player === "speed") {
      speed = (speed + 1) % SPEEDS.length;
      audio!.playbackRate = SPEEDS[speed];
      b.querySelector("span")!.textContent = `Speed: ${SPEEDS[speed]}x`;
      announce(`Speed ${SPEEDS[speed]} times`);
    }
  });
  return el;
}

export function wireListen(sid: string, root: ParentNode) {
  stop(); // a re-render replaces the old buttons
  $$<HTMLButtonElement>("[data-listen]", root).forEach((btn) => btn.addEventListener("click", () => {
    if (active === btn) { stop(); announce("Stopped"); return; }
    stop();
    player ??= buildPlayer();
    const name = sectionName(btn);
    player.setAttribute("aria-label", `Read aloud: ${name}`);
    btn.closest(".section-head")?.after(player);
    active = btn;
    btn.setAttribute("aria-pressed", "true");
    setStatus(`${icon("loader", "spin")}<span>Preparing audio…</span>`);
    announce(`Preparing audio for ${name}`);
    audio!.src = `/api/assessments/${encodeURIComponent(sid)}/audio/${encodeURIComponent(btn.dataset.listen!)}`;
    audio!.playbackRate = SPEEDS[speed];
    audio!.play().catch(() => { /* reported by the error event */ });
  }));
}
