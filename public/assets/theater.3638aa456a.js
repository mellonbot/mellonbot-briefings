// Theater: a visible shell around the deck's own player.
//
// The exported deck already runs a one-slide "stage" (builds, transitions, keys, click halves,
// swipe, #N hashes). It exposes no API, so this file only *drives* it through the inputs it
// already listens to (keydown on window, hashchange) and *reads* it through the DOM it already
// writes (data-off on every slide but the current one). If a future export changes those, the
// bar degrades to dead buttons; the deck itself keeps working.
//
// The build patches the deck so that (a) the stage is used on every aspect ratio, and (b) its
// scale reserves --theater-bar px at the bottom for this bar. See tools/build.mjs PATCHES.
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;
  var slides = Array.prototype.slice.call(doc.querySelectorAll(".deck-slide"));
  var total = slides.length;
  if (!total) return;

  var deckTitle = (doc.title || "").replace(/\s*·.*$/, "");

  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(cls, label, glyph) {
    var b = el("button", "th-btn " + cls, glyph);
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    return b;
  }

  // ---- bar ---------------------------------------------------------------------------
  var bar = el("div", "th-bar");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Slide controls");

  var left = el("div", "th-left");
  var home = el("a", "th-home", "Briefings");
  home.href = "/";
  var title = el("span", "th-title", deckTitle);
  left.append(home, title);

  var track = el("div", "th-track");
  var segs = slides.map(function (_, i) {
    var s = button("", "Slide " + (i + 1), "");
    s.className = "th-seg"; // not .th-btn: segments shrink to fit the track
    s.dataset.i = String(i);
    track.appendChild(s);
    return s;
  });

  var right = el("div", "th-right");
  var prev = button("th-prev", "Previous (←)", "‹");
  var count = el("span", "th-count", "1 / " + total);
  count.setAttribute("aria-live", "polite");
  var next = button("th-next", "Next (→ or space)", "›");
  var fs = button("th-fs", "Present full screen (F)", "⛶");
  right.append(prev, count, next);
  if (doc.fullscreenEnabled) right.appendChild(fs);

  bar.append(left, track, right);
  doc.body.appendChild(bar);
  root.classList.add("theater");

  // ---- drive the deck ------------------------------------------------------------------
  function key(k) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }
  function go(i) {
    if (i === current()) return;
    window.location.hash = "#" + (i + 1); // deck's hashchange handler jumps to the slide
  }
  function toggleFullscreen() {
    if (doc.fullscreenElement) doc.exitFullscreen();
    else root.requestFullscreen().catch(function () {});
  }

  // The deck treats any click on the page as "advance by half" and Space as "next": keep the
  // bar's own clicks and key presses from reaching it, and drop focus so arrows go to the deck.
  bar.addEventListener("click", function (e) {
    e.stopPropagation();
    var t = e.target.closest("button");
    if (!t) return;
    if (t === prev) key("ArrowLeft");
    else if (t === next) key("ArrowRight");
    else if (t === fs) toggleFullscreen();
    else if (t.dataset.i) go(Number(t.dataset.i));
    t.blur();
  });
  bar.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") e.stopPropagation();
  });
  bar.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });

  // ---- read the deck -------------------------------------------------------------------
  function current() {
    for (var i = 0; i < total; i++) if (!slides[i].hasAttribute("data-off")) return i;
    return 0;
  }
  var shown = -1;
  function sync() {
    var i = current();
    if (i === shown) return;
    shown = i;
    count.textContent = i + 1 + " / " + total;
    prev.disabled = i === 0;
    for (var j = 0; j < total; j++) {
      segs[j].classList.toggle("th-past", j < i);
      if (j === i) segs[j].setAttribute("aria-current", "step");
      else segs[j].removeAttribute("aria-current");
    }
  }
  new MutationObserver(sync).observe(doc.querySelector("main") || doc.body, {
    subtree: true, attributes: true, attributeFilter: ["data-off"],
  });
  sync();

  // Segment tooltips: each slide's largest line of text is its headline.
  function headline(slide) {
    var best = null, size = 0;
    var nodes = slide.querySelectorAll(".deck-scaler *");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], own = "";
      for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) own += c.nodeValue;
      if (!own.trim()) continue;
      var px = parseFloat(getComputedStyle(n).fontSize) || 0;
      if (px > size) { size = px; best = n; }
    }
    var t = best ? best.textContent.replace(/\s+/g, " ").trim() : "";
    return t.length > 70 ? t.slice(0, 67) + "…" : t;
  }
  (window.requestIdleCallback || setTimeout)(function () {
    slides.forEach(function (s, i) {
      var h = headline(s);
      var label = "Slide " + (i + 1) + (h ? ": " + h : "");
      segs[i].setAttribute("aria-label", label);
      segs[i].title = label;
    });
  });

  // ---- present mode: full screen, bar overlays and hides when idle ----------------------
  var idle = 0;
  function wake() {
    root.classList.remove("th-idle");
    clearTimeout(idle);
    if (root.classList.contains("th-present")) idle = setTimeout(function () { root.classList.add("th-idle"); }, 2200);
  }
  doc.addEventListener("fullscreenchange", function () {
    var on = !!doc.fullscreenElement;
    root.classList.toggle("th-present", on);
    fs.setAttribute("aria-label", on ? "Exit full screen (F or Esc)" : "Present full screen (F)");
    fs.title = fs.getAttribute("aria-label");
    wake();
    // The deck rescales on resize; make sure it re-reads --theater-bar after the class flip.
    window.dispatchEvent(new Event("resize"));
  });
  ["mousemove", "pointerdown", "keydown", "touchstart"].forEach(function (t) {
    window.addEventListener(t, wake, { passive: true });
  });
})();
