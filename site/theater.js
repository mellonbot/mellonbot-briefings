// Theater: a visible shell around the deck's own player.
//
// Exported decks bring their own player and expose no API. Each player gets an adapter that
// *drives* it through the inputs it already listens to and *reads* its state from the DOM it
// already writes. tools/build.mjs picks the player at build time (<html data-player>) and
// applies that player's guarded patches (stage on every aspect ratio, room for this bar, and
// for the simple player an exposed show()). If a re-export changes a player, the build fails.
(function () {
  "use strict";
  var doc = document;
  var root = doc.documentElement;

  function key(k) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }

  var ADAPTERS = {
    // Single-file deck exports with a #deck-motion timeline: builds, transitions, hash jumps.
    motion: function () {
      var slides = [].slice.call(doc.querySelectorAll(".deck-slide"));
      return {
        slides: slides,
        current: function () {
          for (var i = 0; i < slides.length; i++) if (!slides[i].hasAttribute("data-off")) return i;
          return 0;
        },
        next: function () { key("ArrowRight"); },
        prev: function () { key("ArrowLeft"); },
        go: function (i) { window.location.hash = "#" + (i + 1); }, // player listens to hashchange
        watch: { node: doc.querySelector("main") || doc.body, attr: "data-off" },
        textOf: function (s) { return s.querySelectorAll(".deck-scaler *"); },
        notes: null,
      };
    },
    // Hand-built decks: #stage > section.slide, current slide has .on, <aside> holds speaker notes.
    simple: function () {
      var slides = [].slice.call(doc.querySelectorAll("#stage > .slide"));
      var panel = doc.getElementById("notes");
      var hasNotes = !!panel && slides.some(function (s) { return s.querySelector("aside"); });
      return {
        slides: slides,
        current: function () {
          for (var i = 0; i < slides.length; i++) if (slides[i].classList.contains("on")) return i;
          return 0;
        },
        next: function () { key("ArrowRight"); },
        prev: function () { key("ArrowLeft"); },
        go: function (i) { if (typeof window.__deckShow === "function") window.__deckShow(i); },
        watch: { node: doc.getElementById("stage"), attr: "class" },
        textOf: function (s) { return s.querySelectorAll(":scope *:not(aside):not(aside *)"); },
        notes: hasNotes ? {
          toggle: function () { key("n"); },
          open: function () { return panel.classList.contains("show"); },
          panel: panel,
        } : null,
      };
    },
  };

  var make = ADAPTERS[root.getAttribute("data-player")];
  if (!make) return;
  var deck = make();
  var slides = deck.slides;
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
    var b = el("button", cls, glyph);
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
  left.append(home, el("span", "th-title", deckTitle));

  var track = el("div", "th-track");
  var segs = slides.map(function (_, i) {
    var s = button("th-seg", "Slide " + (i + 1), ""); // not .th-btn: segments shrink to fit
    s.dataset.i = String(i);
    track.appendChild(s);
    return s;
  });

  var right = el("div", "th-right");
  var notesBtn = deck.notes ? button("th-btn th-notes", "Speaker notes (N)", "Notes") : null;
  var prev = button("th-btn th-prev", "Previous (←)", "‹");
  var count = el("span", "th-count", "1 / " + total);
  count.setAttribute("aria-live", "polite");
  var next = button("th-btn th-next", "Next (→ or space)", "›");
  var fs = button("th-btn th-fs", "Present full screen (F)", "⛶");
  if (notesBtn) right.appendChild(notesBtn);
  right.append(prev, count, next);
  if (doc.fullscreenEnabled) right.appendChild(fs);

  bar.append(left, track, right);
  doc.body.appendChild(bar);
  root.classList.add("theater");

  function toggleFullscreen() {
    if (doc.fullscreenElement) doc.exitFullscreen();
    else root.requestFullscreen().catch(function () {});
  }

  // Players treat any page click as "step by half" and Space/Enter as "next": keep the bar's
  // own clicks and keys from reaching them, and drop focus so arrows go back to the deck.
  bar.addEventListener("click", function (e) {
    e.stopPropagation();
    var t = e.target.closest("button");
    if (!t) return;
    if (t === prev) deck.prev();
    else if (t === next) deck.next();
    else if (t === fs) toggleFullscreen();
    else if (t === notesBtn) deck.notes.toggle();
    else if (t.dataset.i) { var i = Number(t.dataset.i); if (i !== deck.current()) deck.go(i); }
    t.blur();
    sync();
  });
  bar.addEventListener("keydown", function (e) {
    if (e.key === " " || e.key === "Enter") e.stopPropagation();
  });
  bar.addEventListener("wheel", function (e) { e.stopPropagation(); }, { passive: true });

  // ---- read the player -------------------------------------------------------------------
  var shown = -1;
  function sync() {
    if (notesBtn) notesBtn.setAttribute("aria-pressed", String(deck.notes.open()));
    var i = deck.current();
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
  if (deck.watch.node) {
    new MutationObserver(sync).observe(deck.watch.node, { subtree: true, attributes: true, attributeFilter: [deck.watch.attr] });
  }
  if (deck.notes) new MutationObserver(sync).observe(deck.notes.panel, { attributes: true, attributeFilter: ["class"] });
  sync();

  // Segment tooltips: each slide's largest line of text is its headline.
  function headline(slide) {
    var best = null, size = 0;
    var nodes = deck.textOf(slide);
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
    // Players rescale on resize; make sure they re-read --theater-bar after the class flip.
    window.dispatchEvent(new Event("resize"));
  });
  ["mousemove", "pointerdown", "keydown", "touchstart"].forEach(function (t) {
    window.addEventListener(t, wake, { passive: true });
  });
})();
