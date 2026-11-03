/* OCI Capacity Coach: progressive enhancement only. Every page works without this file. */
(function () {
  "use strict";
  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  // Controls that need JS are rendered hidden and revealed here.
  $$("[data-js-only]").forEach(function (el) {
    if (el.hasAttribute("data-listen") && !("speechSynthesis" in window)) return;
    el.hidden = false;
  });

  /* Display preferences: data attributes on <html>, persisted in localStorage. */
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem("oci-display") || "{}"); } catch (e) {}
  var attrs = { text: ["text", "large"], contrast: ["contrast", "high"] };
  $$("[data-display]").forEach(function (box) {
    var key = box.getAttribute("data-display");
    box.checked = !!prefs[key];
    box.addEventListener("change", function () {
      prefs[key] = box.checked;
      if (box.checked) root.dataset[attrs[key][0]] = attrs[key][1];
      else delete root.dataset[attrs[key][0]];
      try { localStorage.setItem("oci-display", JSON.stringify(prefs)); } catch (e) {}
    });
  });
  var menu = $(".display-menu");
  if (menu) {
    menu.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.open) { menu.open = false; $("summary", menu).focus(); }
    });
    document.addEventListener("click", function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }

  /* Focus management: error summaries and the "report ready" heading. */
  var focusTarget = location.hash === "#ready" ? document.getElementById("ready") : $("[data-focus-on-load]");
  if (focusTarget) { focusTarget.focus(); }

  /* Password show/hide. */
  $$("[data-toggle-password]").forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute("data-toggle-password"));
    btn.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  /* Questionnaire: live count of answered statements. */
  var form = $("[data-questionnaire]");
  var progress = $("[data-progress]");
  if (form && progress) {
    var base = Number(progress.getAttribute("data-base")) || 0;
    var total = Number(progress.getAttribute("data-total")) || 0;
    var bar = $("progress", progress);
    var text = $("[data-progress-text]", progress);
    var live = $("[data-live-count]");
    var pageTotal = $$(".question", form).length;
    form.addEventListener("change", function (e) {
      if (e.target.type !== "radio") return;
      var here = $$("input[type=radio]:checked", form).length;
      bar.value = base + here;
      text.textContent = (base + here) + " of " + total + " statements answered";
      live.textContent = here + " of " + pageTotal + " statements answered in this area.";
      var fs = e.target.closest(".question");
      if (fs && fs.classList.contains("field--error")) {
        fs.classList.remove("field--error");
        var err = $(".field-error", fs);
        if (err) err.hidden = true;
      }
    });
  }

  /* Results: poll pipeline status and update the step list. */
  var panel = $("#processing[data-status='running']");
  if (panel && window.fetch) {
    var url = panel.getAttribute("data-status-url");
    var announce = $("[data-status-live]", panel);
    var labels = { pending: "Waiting", running: "In progress", done: "Done", error: "Did not finish" };
    var poll = function () {
      fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) {
          var changes = [];
          (data.steps || []).forEach(function (s) {
            var li = $("[data-step='" + s.key + "']", panel);
            if (!li || li.getAttribute("data-state") === s.state) return;
            li.setAttribute("data-state", s.state);
            $("[data-state-text]", li).textContent = labels[s.state] || s.state;
            changes.push(s.label + ": " + (labels[s.state] || s.state).toLowerCase() + ".");
          });
          if (data.status === "done") {
            announce.textContent = "Your report is ready. Loading it now.";
            location.hash = "ready";
            location.reload();
            return;
          }
          if (data.status === "error") { location.reload(); return; }
          if (changes.length) announce.textContent = changes.join(" ");
          setTimeout(poll, 2000);
        })
        .catch(function () { setTimeout(poll, 4000); });
    };
    setTimeout(poll, 2000);
  }

  /* Listen: read a section aloud with the browser's speech engine. */
  var speaking = null;
  var resetListen = function () {
    if (speaking) speaking.setAttribute("aria-pressed", "false");
    speaking = null;
  };
  $$("[data-listen]").forEach(function (btn) {
    if (!("speechSynthesis" in window)) return;
    btn.addEventListener("click", function () {
      var wasMe = speaking === btn;
      window.speechSynthesis.cancel();
      resetListen();
      if (wasMe) return;
      var target = $(btn.getAttribute("data-listen"));
      if (!target) return;
      var u = new SpeechSynthesisUtterance(target.innerText);
      u.lang = btn.getAttribute("data-lang") === "es" ? "es-US" : "en-US";
      u.onend = u.onerror = function () { if (speaking === btn) resetListen(); };
      speaking = btn;
      btn.setAttribute("aria-pressed", "true");
      window.speechSynthesis.speak(u);
    });
  });
  window.addEventListener("pagehide", function () { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); });

  /* Print: open disclosures so printed reports include their content. */
  window.addEventListener("beforeprint", function () {
    $$("main details:not([open])").forEach(function (d) { d.setAttribute("open", ""); d.setAttribute("data-print-opened", ""); });
  });
  window.addEventListener("afterprint", function () {
    $$("details[data-print-opened]").forEach(function (d) { d.removeAttribute("open"); d.removeAttribute("data-print-opened"); });
  });
})();
