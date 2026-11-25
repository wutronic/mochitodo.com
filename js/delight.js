/* Small moving details on the home page: depth as you scroll, things that rise into place, a
   little burst when a box is ticked, cards that lean toward the pointer.

   None of it carries meaning: with this file missing, or with "reduce motion" on, the page reads
   exactly the same and nothing is hidden. Everything is transform and opacity only, driven by one
   scroll handler, so it stays smooth on a phone. */
(function () {
  var root = document.documentElement;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("motion");          // the CSS for hidden-until-seen only applies with this class
  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var all = function (sel, from) { return Array.prototype.slice.call((from || document).querySelectorAll(sel)); };

  // ---------------------------------------------------------------- 1. depth on scroll
  // Each piece moves a little against the page as it crosses the screen. depth = how many pixels
  // it travels from the middle of the screen to the edge; tilt = how far it leans on the way.
  var layers = [];
  function layer(sel, depth, tilt) {
    all(sel).forEach(function (el) {
      el.classList.add("plx");
      if (tilt) el.style.setProperty("--tilt", tilt + "deg");
      layers.push({ el: el, depth: depth, y: 0, top: 0, h: 0 });
    });
  }
  layer(".shots figure:nth-child(1)", 26, -1.4);
  layer(".shots figure:nth-child(2)", -20, 1.4);
  layer(".drop", 18, 0);
  layer(".pair-pal:first-child", 16, 0);
  layer(".pair-pal:last-child", -10, 0);
  // (The pal's stage stays put: its head lines up with the "Meet your pal" title.)

  // Things pinned to the top of the page move with how far you have scrolled, not where they are.
  var sky = all(".sky i").map(function (el) { return { el: el, depth: parseFloat(el.getAttribute("data-depth")) || 0.2 }; });
  var farHill = document.querySelector(".floor > .hill svg:first-child");
  var floorArt = document.querySelector(".floor-art");
  var vh = window.innerHeight, px = 0, py = 0;

  function measure() {
    vh = window.innerHeight;
    var sy = window.pageYOffset;
    layers.forEach(function (it) {
      var r = it.el.getBoundingClientRect();
      it.top = r.top + sy - it.y; it.h = r.height;
    });
  }
  function update() {
    waiting = false;
    var sy = window.pageYOffset;
    layers.forEach(function (it) {
      var p = (it.top + it.h / 2 - sy - vh / 2) / vh;          // -0.5 at the top edge, 0.5 at the bottom
      if (p < -1.1 || p > 1.1) return;
      it.y = -p * it.depth * 2;
      it.el.style.setProperty("--py", it.y.toFixed(1) + "px");
      it.el.style.setProperty("--p", p.toFixed(3));
    });
    if (sy < vh * 1.4) {
      sky.forEach(function (s) {
        s.el.style.setProperty("--py", (-sy * s.depth + py * s.depth * 40).toFixed(1) + "px");
        s.el.style.setProperty("--px", (px * s.depth * 60).toFixed(1) + "px");
      });
      if (farHill) farHill.style.transform = "translate3d(" + (-sy * 0.03).toFixed(1) + "px," + Math.min(sy * 0.05, 22).toFixed(1) + "px,0)";
    }
    if (floorArt) {
      var r = floorArt.getBoundingClientRect();
      // The picture only ever slides DOWN behind the footer's hill, never up: sliding up would
      // lift its bottom edge into view and leave a hard line above the hill.
      if (r.top < vh && r.bottom > 0) floorArt.style.backgroundPositionY = "calc(100% + " + Math.min(Math.max((vh - r.top) * 0.08, 0), 60).toFixed(1) + "px)";
    }
  }
  var waiting = false;
  function ask() { if (!waiting) { waiting = true; requestAnimationFrame(update); } }
  window.addEventListener("scroll", ask, { passive: true });
  window.addEventListener("resize", function () { measure(); ask(); });
  window.addEventListener("load", function () { measure(); ask(); });
  if ("ResizeObserver" in window) new ResizeObserver(function () { measure(); ask(); }).observe(document.body);
  if (finePointer) {
    window.addEventListener("pointermove", function (e) {
      px = e.clientX / window.innerWidth - 0.5; py = e.clientY / window.innerHeight - 0.5;
      ask();
    }, { passive: true });
  }
  measure(); update();

  // ---------------------------------------------------------------- 2. rise into place
  var rise = all(".task-say > *, .task-show > *, .hero .cta");
  if ("IntersectionObserver" in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        seen.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    rise.forEach(function (el) {
      // Anything already on screen when the page opens is simply there; only what is below rises.
      if (el.getBoundingClientRect().top < vh * 0.95) return;
      var n = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty("--d", Math.min(n, 4) * 70 + "ms");
      el.classList.add("rise");
      seen.observe(el);
    });
  }

  // ---------------------------------------------------------------- 3. a burst when a box is ticked
  var BITS = [[-30, -22, "leaf"], [-12, -36, "heart"], [10, -38, "leaf"], [30, -24, "gold"], [38, 2, "leaf"], [-38, 0, "gold"], [-22, 26, "leaf"], [24, 26, "heart"]];
  function burst(box) {
    var r = box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    var holder = document.createElement("span");
    holder.className = "tick-burst"; holder.setAttribute("aria-hidden", "true");
    BITS.forEach(function (b, n) {
      var bit = document.createElement("i");
      bit.className = b[2];
      bit.style.setProperty("--x", b[0] + "px"); bit.style.setProperty("--y", b[1] + "px");
      bit.style.setProperty("--r", (n % 2 ? 1 : -1) * (40 + n * 17) + "deg");
      holder.appendChild(bit);
    });
    box.appendChild(holder);
    setTimeout(function () { holder.remove(); }, 800);
  }
  if ("MutationObserver" in window) {
    var ready = false;
    setTimeout(function () { ready = true; }, 600);               // not for boxes ticked as the page opens
    var watch = new MutationObserver(function (changes) {
      if (!ready) return;
      changes.forEach(function (c) { if (c.target.getAttribute("aria-pressed") === "true") burst(c.target); });
    });
    all(".box").forEach(function (b) { watch.observe(b, { attributes: true, attributeFilter: ["aria-pressed"] }); });
  }

  // ---------------------------------------------------------------- 4. cards lean toward the pointer
  if (finePointer) {
    all(".shelf .world, .shot").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--lx", x.toFixed(3)); card.style.setProperty("--ly", y.toFixed(3));
      });
      card.addEventListener("pointerleave", function () { card.style.setProperty("--lx", 0); card.style.setProperty("--ly", 0); });
    });
  }
})();
