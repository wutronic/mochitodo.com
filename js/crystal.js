/* The daily crystal, as it behaves in the app.
   A port of HeartPals/Components/CrystalDropView.swift: same timings, same motion. It falls with
   a sparkle trail, lands with a squash and a ring of light, hovers with a shimmer and drifting
   sparkles. Tapped, it turns white, shakes harder and harder, and bursts: Mochi Bucks arc out,
   bounce on the floor and fly into the balance, and a heart floats up into its slot.
   Every position is a function of the time since the fall, the tap or the burst.

   One shot: a visitor taps the crystal once. This page remembers that and never offers it again.

   What the crystal pays is NOT decided here. On the tap this asks the server (the crystal-roll
   function), which picks 30 to 100 Mochi Bucks and 1 to 3 hearts, stores them, and sends back an
   id. The server also remembers the sender, so tapping again from a wiped browser gets the same win. The
   sign-up form sends that id with the email, and the server looks the amount up again. So
   changing any number on this page (or in the browser's storage) only changes what this page
   shows; it never changes what an account is paid. */
(function () {
  var stage = document.getElementById("crystal-stage");
  if (!stage) return;
  var canvas = stage.querySelector("canvas"), ctx = canvas.getContext("2d");
  var hit = document.getElementById("crystal-hit");
  var bucksEl = document.getElementById("crystal-bucks");
  var pill = document.getElementById("crystal-pill");
  var heartEls = Array.prototype.slice.call(document.querySelectorAll("#crystal-hearts .crystal-heart"));
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var total = document.getElementById("crystal-total"), totalNum = document.getElementById("crystal-total-n");
  var hint = stage.querySelector(".crystal-hint");
  var win = document.getElementById("crystal-win"), winHead = document.getElementById("crystal-win-head");
  var winText = document.getElementById("crystal-win-text");
  var winHome = win.parentNode, winNext = win.nextSibling;   // where the panel waits during the show
  var present = document.getElementById("crystal-present"), dock = document.getElementById("present-dock");
  var leftEl = document.getElementById("crystal-left"), claim = document.getElementById("crystal-claim");
  var rollUrl = stage.getAttribute("data-roll");
  // The win as a heap of coins, one per Mochi Buck (public/js/coinpile.js).
  // While unclaimed, the coins pour into the present, which gulps each one.
  var gulpTimer = 0;
  var pile = window.MochiCoinPile ? window.MochiCoinPile(stage, {
    target: function () {
      if (present.hidden) return null;
      var s = stage.getBoundingClientRect(), r = present.querySelector("img").getBoundingClientRect();
      return { x: r.left + r.width / 2 - s.left, y: r.top + r.height * 0.55 - s.top };
    },
    onArrive: function () {
      present.classList.remove("gulp"); void present.offsetWidth; present.classList.add("gulp");
      clearTimeout(gulpTimer); gulpTimer = setTimeout(function () { present.classList.remove("gulp"); }, 200);
    }
  }) : { fill: function () {}, clear: function () {} };
  // The same win rains again around the pal in "Get Mochi" while it's still waiting to be claimed.
  var getStage = document.getElementById("get-stage");
  var getPile = getStage && window.MochiCoinPile ? window.MochiCoinPile(getStage) : null;
  function dressGetPile() {
    if (!getPile) return;
    if (won && !won.saved && !ranOut(won)) getPile.fill(won.amount, false); else getPile.clear();
  }
  var HINT = hint.textContent, KEY = "mochi-crystal";

  var CW = 82, CH = 82 * 420 / 320, COIN = 30, HEART = 34, COINS = 10;
  // Snappier than the app's own timings (the website's visitors are deciding, not playing).
  var FALL = reduce ? 0.3 : 0.7, CHARGE = reduce ? 0.25 : 0.4;
  var COLLECT = 0.38, HEART_FLY = 0.7, HEART_DUR = 0.45;
  var PALETTE = [[158, 242, 255], [204, 179, 255], [255, 247, 255], [255, 199, 242]];
  var TAU = Math.PI * 2;

  var art = {};
  ["crystal", "coin", "heart-full"].forEach(function (name) {
    var im = new Image(); im.src = "/images/app/" + name + ".png"; art[name] = im;
  });
  var scratch = document.createElement("canvas"), sctx = scratch.getContext("2d");

  var W = 0, H = 0, dpr = 1, rest = { x: 0, y: 0 }, bucksT = { x: 0, y: 0 }, heartT = [];
  var drop = null, visible = false, frame = 0;
  // What this visitor won, as the server told it: {id, amount, expires (ms), saved}. Kept in the
  // browser only so the page can show it again; the server holds the real record.
  var won = null;

  function now() { return performance.now() / 1000; }
  function rnd(i, k) { var x = Math.sin(drop.seed + i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }
  function smooth(a, b, x) { var t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function bez(a, c, b, t) { var u = 1 - t; return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")"; }
  function color(i) { return PALETTE[Math.floor(rnd(i, 9) * PALETTE.length) % PALETTE.length]; }
  function collectStart(i) { return 0.85 + i * 0.05; }

  function layout() {
    var r = stage.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    rest = { x: W / 2, y: H / 2 + CH / 2 + 10 };          // the crystal hovers in the middle of the stage (10 = its hover lift)
    var p = pill.querySelector("img").getBoundingClientRect();
    bucksT = { x: p.left + p.width / 2 - r.left, y: p.top + p.height / 2 - r.top };
    heartT = heartEls.map(function (el) {
      var h = el.getBoundingClientRect();
      return { x: h.left + h.width / 2 - r.left, y: h.top + h.height / 2 - r.top };
    });
  }

  function newDrop(delay) {
    drop = { seed: Math.random() * 1000, fallsAt: now() + delay, openedAt: null, burstAt: null, amount: 0, hearts: 1,
             arrived: 0, heartsIn: 0, done: false };
  }

  function readWon() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { v = window.__mochiCrystal || null; }
    if (!v || typeof v.id !== "string" || !(v.amount >= 30 && v.amount <= 100)) return null;
    // Kept for good, even once it has run out: the crystal is one shot.
    return { id: v.id, amount: Math.round(v.amount), hearts: Math.min(3, Math.max(1, Math.round(v.hearts) || 1)),
             expires: v.expires, saved: !!v.saved, why: v.why === "has_one" || v.why === "used" ? v.why : "" };
  }
  function ranOut(v) { return !v.saved && !(v.expires > Date.now()); }
  function heartWord(n) { return n + (n === 1 ? " heart" : " hearts"); }
  function fillHearts(n) { heartEls.forEach(function (el, i) { el.classList.toggle("on", i < n); }); }
  function writeWon(v) {
    window.__mochiCrystal = v;
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private window */ }
    window.dispatchEvent(new CustomEvent("mochi-crystal"));
  }
  function clock2(n) { return (n < 10 ? "0" : "") + n; }
  /* The present. Until the win is claimed it waits wrapped (and shaking) where the crystal was.
     On a fresh win the total tucks away and the present drops in over it; once the win is saved
     to an email, the present opens and the total is shown again. */
  var wrapped = false;
  function wrap(on, opened) {
    if (on === wrapped) return;
    wrapped = on;
    if (on) {
      present.hidden = false;
      stage.classList.add("wrapped");
      if (drop && drop.burstAt !== null && !reduce) stage.classList.add("fresh");   // just won, on this visit
    } else if (opened && !reduce) {
      stage.classList.add("opening");
      if (!dock.hidden) dock.classList.add("opening");
      setTimeout(function () {
        stage.classList.remove("opening", "wrapped", "fresh"); present.hidden = true; present.style.visibility = "";
        dock.classList.remove("opening"); dockCheck();
      }, 600);
      return;
    } else {
      stage.classList.remove("wrapped", "fresh"); present.hidden = true;
    }
    dockCheck();
  }

  /* Once the wrapped present scrolls off the top of the screen it waits in the bottom-right
     corner, shaking, and now and then says to claim it. The bubble keeps quiet once the sign-up
     form is on screen (or already passed): "below" would no longer be true. */
  // One present, three places it can be. While the win is unclaimed it starts in the stage; as it
  // slides up under the header it flies to the bottom-right corner and follows you. If you never
  // opened the crystal, the present joins you in the corner once you've scrolled past it, and when
  // "Get Mochi" comes into view it flies into place there, next to a nudge to go back and open it.
  // Scroll back and it flies back the way it came. Only the corner one moves: the others are swapped
  // in when it lands.
  var stagePassed = false, presentPassed = false, slotIn = false, formReached = false, sayTimer = 0;
  var at = "none", flight = null;
  var dockGift = dock.querySelector(".present-dock-gift"), presentImg = present.querySelector("img");
  var dockSay = dock.querySelector(".present-say");
  var slot = document.getElementById("get-gift"), slotImg = slot && slot.querySelector("img");
  var remind = document.getElementById("get-remind");
  function onto(a, b) {                                   // the transform that lays box b over box a
    return "translate(" + (a.left - b.left).toFixed(1) + "px," + (a.top - b.top).toFixed(1) + "px) scale(" + (a.width / b.width).toFixed(3) + ")";
  }
  function unopened() { return !won && !!rollUrl && !(drop && drop.openedAt !== null); }
  function where() {
    if (wrapped) return presentPassed ? "corner" : "stage";
    if (unopened()) return slot && slotIn ? "slot" : stagePassed ? "corner" : "none";
    return "none";
  }
  function rectAt(place) {
    var el = place === "stage" ? presentImg : place === "slot" ? slotImg : null;
    var r = el && el.getBoundingClientRect();
    return r && r.width ? r : null;
  }
  function show(place) {                                  // exactly one place shows the present
    present.style.visibility = place === "stage" || !wrapped ? "" : "hidden";
    dock.hidden = place !== "corner";
    if (slot) slot.classList.toggle("here", place === "slot");
  }
  function dressDock() {                                  // what the corner present says and where it goes
    var claim = !!wrapped;
    dockGift.setAttribute("href", claim ? "#get" : "#hearts-task");
    dockGift.setAttribute("aria-label", claim ? "Your present. Sign up below to claim it." : "Your prize. Go back and open it.");
    dockSay.textContent = claim ? "Don't forget to claim me by signing up below!" : "Claim me!";
    if (remind) remind.hidden = !unopened();
    if (slot) slot.hidden = !unopened();
  }
  function dockCheck() {
    if (dock.classList.contains("opening") || stage.classList.contains("opening")) return;
    dressDock();
    var to = where();
    if (flight) { if (flight.to === to) return; flight.onfinish = null; flight.cancel(); at = flight.to; flight = null; show(at); }
    if (to === at) { show(at); return; }
    var from = at; at = to;
    clearTimeout(sayTimer); dock.classList.remove("say");
    var fromRect = rectAt(from), toRect = rectAt(to);
    if (to === "corner") {                                // lift off from where it was, land in the corner
      show("corner");
      if (!reduce && fromRect) {
        flight = dockGift.animate([{ transform: onto(fromRect, dockGift.getBoundingClientRect()) }, { transform: "none" }],
                                  { duration: 720, easing: "cubic-bezier(0.22, 0.8, 0.25, 1)" });
        flight.to = to; flight.onfinish = function () { flight = null; };
      }
      sayTimer = setTimeout(say, 1600);
    } else if (from === "corner" && !reduce && toRect && !dock.hidden) {   // fly from the corner into place
      flight = dockGift.animate([{ transform: "none" }, { transform: onto(toRect, dockGift.getBoundingClientRect()) }],
                                { duration: to === "slot" ? 680 : 520, easing: "cubic-bezier(0.4, 0, 0.2, 1)" });
      flight.to = to; flight.onfinish = function () { flight = null; show(to); };
    } else show(to);
  }
  function say() {
    if (dock.hidden) return;
    dock.classList.toggle("say", !(wrapped && formReached));
    sayTimer = setTimeout(function () { dock.classList.remove("say"); sayTimer = setTimeout(say, 8000); }, 4500);
  }
  // Tapping the corner present: unclaimed → the sign-up box (cursor in the field); unopened → the crystal.
  dockGift.addEventListener("click", function () {
    if (!wrapped) return;
    setTimeout(function () { var e = document.getElementById("access-email"); if (e && e.offsetParent) e.focus({ preventScroll: true }); }, 700);
  });
  // Where things are, read straight from the page on every scroll (once a frame): a fast fling can
  // jump right past an element, which an IntersectionObserver would never report.
  var headerH = (document.querySelector(".site-header") || {}).offsetHeight || 64, placing = false;
  function gone(el) { var r = el.getBoundingClientRect(); return r.height > 0 && r.bottom <= headerH + 1; }
  function measure() {
    placing = false;
    presentPassed = gone(present);                        // the stage's present has slid up under the header
    stagePassed = gone(stage);                            // so has the whole stage (crystal never opened)
    if (slot) {                                           // its place in "Get Mochi" is well on screen
      var r = slot.parentNode.getBoundingClientRect(), vh = window.innerHeight;
      slotIn = r.bottom > vh * 0.2 && r.top < vh * 0.8;
    }
    dockCheck();
    barCheck();
  }
  // The claim button sticks under the header once it has scrolled up out of sight, and steps away again
  // when the sign-up form is on screen (or the win is claimed or runs out).
  // When the form's own button ("Sign up and claim") comes into view, the Sign up buttons at the top
  // fade away (the sticky one and the header's), and fade back if you scroll up again.
  var formGo = document.getElementById("access-go"), siteHeader = document.querySelector(".site-header"), barFade = 0;
  function barCheck() {
    if (!bar) return;
    var g = formGo && formGo.getBoundingClientRect(), goIn = !!g && g.height > 0 && g.top < window.innerHeight && g.bottom > 0;
    if (siteHeader) siteHeader.classList.toggle("form-in", goIn);
    var on = false;
    if (won && !won.saved && !ranOut(won) && !win.hidden && !claim.hidden) {
      var c = claim.getBoundingClientRect();
      on = c.height > 0 && c.bottom <= headerH && !goIn;
    }
    var showing = !bar.hidden && !bar.classList.contains("leaving");
    if (on === showing) return;
    clearTimeout(barFade);
    if (on) {
      bar.classList.remove("leaving"); bar.hidden = false;
      clockText(); startClock();
    } else {
      bar.classList.add("leaving");
      barFade = setTimeout(function () { bar.hidden = true; bar.classList.remove("leaving"); }, reduce ? 0 : 320);
    }
    if (siteHeader) siteHeader.classList.toggle("bar-on", on);
  }
  document.getElementById("claim-bar-btn").addEventListener("click", function () {
    setTimeout(function () { var e = document.getElementById("access-email"); if (e && e.offsetParent) e.focus({ preventScroll: true }); }, 700);
  });
  function remeasure() { if (!placing) { placing = true; requestAnimationFrame(measure); } }
  window.addEventListener("scroll", remeasure, { passive: true });
  window.addEventListener("resize", remeasure);
  if ("IntersectionObserver" in window) {
    var form = document.getElementById("access") || document.getElementById("get");
    if (form) new IntersectionObserver(function (entries) {
      var e = entries[0];
      formReached = e.isIntersecting || e.boundingClientRect.top < 0;
      if (formReached && wrapped) dock.classList.remove("say");
    }).observe(form);
  }

  /* The panel under the stage: what you won, that it is yours, and how long you have. */
  function showWin() {
    // The panel, and its countdown, show the moment the server answers. The stage (the total, then
    // the present) waits until the burst has played out, so it doesn't spoil the show.
    var has = !!won, landed = has && (!drop || drop.done);
    win.hidden = !has; total.hidden = !landed;
    stage.classList.toggle("won", landed);
    if (!has) { wrap(false); dressGetPile(); return; }
    var gone = ranOut(won);
    // During the show the panel sits under the stage (so the countdown starts at once); when the
    // show is over it moves up into the stage, over the coins.
    if (landed && win.parentNode !== stage) { stage.appendChild(win); win.classList.add("in-stage"); }
    else if (!landed && win.parentNode === stage) { winHome.insertBefore(win, winNext); win.classList.remove("in-stage"); }
    if (landed) {
      if (gone) pile.clear(); else pile.fill(won.amount, !won.saved);
      dressGetPile();
      wrap(!gone && !won.saved, won.saved);
      stage.classList.toggle("gone", gone);
      bucksEl.textContent = gone ? 0 : won.amount; totalNum.textContent = won.amount; fillHearts(gone ? 0 : won.hearts);
    }
    claim.hidden = true;
    if (gone) {
      winText.hidden = false;
      winHead.textContent = won.why ? "Your crystal is spent." : "Your crystal ran out.";
      winText.textContent = won.why === "has_one" ? "Your email already has a crystal prize, so it keeps that one."
        : won.why === "used" ? "This prize was already saved to another email."
        : "It paid " + won.amount + " Mochi Bucks and " + heartWord(won.hearts) + ", but the time ran out. You can still sign up below.";
    } else if (won.saved) {
      winText.hidden = false;
      winHead.textContent = won.amount + " Mochi Bucks and " + heartWord(won.hearts) + ". They're yours.";
      winText.textContent = "They're saved to your email. Log in to the app with it to get them.";
    } else {
      // Unclaimed: one line says it all; the button carries the countdown.
      winText.hidden = true;
      winHead.textContent = "Claim " + won.amount + " Mochi Bucks for skins and " + won.hearts + " bonus " + (won.hearts === 1 ? "heart" : "hearts");
      claim.hidden = false;
      clockText(); startClock();
    }
  }
  setInterval(function () { if (won && !won.saved && !win.hidden) showWin(); if (typeof barCheck === "function") barCheck(); }, 250);   // each second lands on time
  // The countdown on the button runs to the millisecond (59:59.874), redrawn every frame while it's on
  // screen, from the moment the win appears. Hours show only if more than one is left.
  var clockOn = false, clockSeen = true;
  var bar = document.getElementById("claim-bar"), barLeft = document.getElementById("claim-bar-left");
  function clockText() {
    var ms = Math.max(0, won.expires - Date.now()), s = Math.floor(ms / 1000);
    var text = (s >= 3600 ? Math.floor(s / 3600) + ":" : "") + clock2(Math.floor(s / 60) % 60) + ":" + clock2(s % 60) +
               "." + String(Math.floor(ms % 1000)).padStart(3, "0");
    leftEl.textContent = text;
    if (bar && !bar.hidden) barLeft.textContent = text;
    var formLeft = document.getElementById("access-go-left");
    if (formLeft) formLeft.textContent = text;
  }
  function startClock() { if (!clockOn) { clockOn = true; requestAnimationFrame(clockFrame); } }
  function clockFrame() {
    if (!won || won.saved || win.hidden || claim.hidden) { clockOn = false; return; }
    if (clockSeen || (bar && !bar.hidden) || document.getElementById("access-go-left")) clockText();   // any of the three on screen
    requestAnimationFrame(clockFrame);
  }
  if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { clockSeen = e[0].isIntersecting; if (clockSeen) clockText(); }).observe(leftEl);
  window.addEventListener("mochi-crystal", function () {      // the sign-up form saved it (or another tab did)
    var fresh = readWon();
    if (fresh && won && fresh.id === won.id) { won = fresh; showWin(); }
  });

  function clockAt(t) {
    var fall = t - drop.fallsAt, c = { fall: fall, landed: fall - FALL, opened: null, burst: null };
    if (drop.openedAt !== null) {
      c.opened = t - drop.openedAt;
      // It keeps charging (and shaking) until the server has answered with the amount.
      if (drop.burstAt !== null && t >= drop.burstAt) c.burst = t - drop.burstAt;
    }
    return c;
  }
  function canOpen(c) { return c.landed >= 0.15 && c.opened === null; }

  // ---------------------------------------------------------------- crystal
  function crystalPose(c) {
    var p = { sx: 1, sy: 1, rot: 0, op: 1, white: 0, shimX: 0, shimOp: 0, lift: 0 };
    var bx = rest.x, by = rest.y;
    if (c.fall < 0) p.op = 0;
    else if (c.landed < 0) {
      var q = c.fall / FALL;
      if (reduce) p.op = q;
      else {
        // Falls under gravity, drifting in from the right and righting itself.
        var startY = -CH - 40;
        by = startY + (rest.y - startY) * q * q;
        bx = rest.x + 34 * (1 - q) * (1 - q);
        p.rot = -18 * Math.pow(1 - q, 1.4) + 5 * Math.sin(q * 10) * (1 - q);
        p.lift = rest.y - by;
      }
    } else if (!reduce) {
      var t = c.landed;
      var squash = 0.2 * Math.exp(-8 * t) * Math.cos(19 * t);      // squash on impact, springing back
      p.sy = 1 - squash; p.sx = 1 + 0.6 * squash;
      var hover = 10 * smooth(0.3, 1.2, t);                         // then it lifts off and hovers
      var bob = 3.5 * Math.sin(TAU * (t - 1.2) / 2.6) * smooth(1.2, 1.9, t);
      p.lift = hover + bob; by -= p.lift;
      p.rot = 2.2 * Math.sin(TAU * t / 3.4) * smooth(0.6, 1.6, t);
    }
    // The shimmer: a sweep every 3s, plus one as it lands.
    var sweep = ((Math.max(c.fall, 0) + 2.2) % 3) / 1.05;
    if (sweep <= 1) { p.shimX = CW * (-0.9 + 1.8 * sweep); p.shimOp = Math.sin(Math.PI * sweep); }

    if (c.opened !== null) {
      var k = Math.min(c.opened / CHARGE, 1);
      p.white = smooth(0, 0.75, k);
      if (!reduce) {
        var amp = 1.2 + 6.5 * k * k;                                // shakes harder and swells with light
        bx += amp * Math.sin(c.opened * 58);
        p.rot += amp * 0.8 * Math.sin(c.opened * 43 + 0.7);
        var swell = 1 + 0.1 * k; p.sx *= swell; p.sy *= swell;
      }
      p.shimOp *= 1 - p.white;
    }
    if (c.burst !== null) {
      var b = Math.min(c.burst / 0.16, 1), pop = 1 + 0.5 * b;
      p.sx *= pop; p.sy *= pop; p.op *= 1 - b;
    }
    p.bx = bx; p.by = by; p.cx = bx; p.cy = by - CH / 2;
    return p;
  }
  function burstCenter() { return { x: rest.x, y: rest.y - 10 - CH * 0.5 }; }

  function drawCrystal(p) {
    if (p.op <= 0.01 || !art.crystal.complete || !art.crystal.naturalWidth) return;
    // Build the crystal with its shimmer and whiteness on a scratch canvas, masked to its shape.
    var sw = Math.ceil(CW * dpr), sh = Math.ceil(CH * dpr);
    if (scratch.width !== sw || scratch.height !== sh) { scratch.width = sw; scratch.height = sh; }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.globalCompositeOperation = "source-over"; sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, CW, CH);
    sctx.drawImage(art.crystal, 0, 0, CW, CH);
    sctx.globalCompositeOperation = "source-atop";
    if (p.shimOp > 0.01) {
      sctx.save();
      sctx.translate(CW / 2 + p.shimX, CH / 2); sctx.rotate(22 * Math.PI / 180);
      var bw = CW * 0.42, g = sctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255," + (0.9 * p.shimOp).toFixed(3) + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
      sctx.fillStyle = g; sctx.globalCompositeOperation = "lighter";
      sctx.fillRect(-bw / 2, -CH * 0.85, bw, CH * 1.7);
      sctx.restore();
      // Keep only what falls on the crystal.
      sctx.globalCompositeOperation = "destination-in"; sctx.drawImage(art.crystal, 0, 0, CW, CH);
      sctx.globalCompositeOperation = "source-atop";
    }
    if (p.white > 0.01) { sctx.fillStyle = "rgba(255,255,255," + p.white.toFixed(3) + ")"; sctx.fillRect(0, 0, CW, CH); }

    ctx.save();
    ctx.globalAlpha = p.op;
    ctx.translate(p.bx, p.by); ctx.rotate(p.rot * Math.PI / 180); ctx.scale(p.sx, p.sy);
    ctx.drawImage(scratch, -CW / 2, -CH, CW, CH);
    ctx.restore();
  }

  // ---------------------------------------------------------------- coins
  function coinLanding(i) {
    var slot = COINS === 1 ? 0 : (i / (COINS - 1)) * 2 - 1, spread = 70 + 8 * COINS;
    var x = rest.x + slot * spread + (rnd(i, 1) - 0.5) * 22;
    x = Math.min(Math.max(x, 26), W - 26);
    return { x: x, y: rest.y + rnd(i, 2) * 18 - 4 };
  }
  function coinPose(i, c) {
    if (c.burst === null || reduce) return null;
    var t = c.burst, launch = 0.02 * i + rnd(i, 3) * 0.05, flight = 0.42 + rnd(i, 4) * 0.1, local = t - launch;
    if (local < 0) return null;
    var start = burstCenter(), land = coinLanding(i), peak = 110 + rnd(i, 5) * 60;
    var spin = (rnd(i, 6) > 0.5 ? 1 : -1) * (240 + rnd(i, 7) * 200);
    var cs = collectStart(i);
    if (t >= cs) {
      var p = Math.min((t - cs) / COLLECT, 1);
      if (p >= 1) return null;
      var e = p * p * (3 - 2 * p);                                  // lifts off gently, then zips into the balance
      var pos = bez(land, { x: (land.x + bucksT.x) / 2, y: Math.min(land.y, bucksT.y) - 80 }, bucksT, e);
      return { x: pos.x, y: pos.y, s: 1 + 0.15 * Math.sin(Math.PI * e), rot: 0, op: p > 0.82 ? (1 - p) / 0.18 : 1, lift: null };
    }
    if (local < flight) {
      var q = local / flight;
      var y = start.y + (land.y - start.y) * q - peak * 4 * q * (1 - q);
      return { x: start.x + (land.x - start.x) * q, y: y, s: 0.35 + 0.65 * Math.min(q * 3, 1), rot: spin * (1 - q), op: 1, lift: land.y - y };
    }
    var b = local - flight, hop = 0;                               // two little bounces, then it sits on the floor
    if (b < 0.22) { var q1 = b / 0.22; hop = 16 * 4 * q1 * (1 - q1); }
    else if (b < 0.36) { var q2 = (b - 0.22) / 0.14; hop = 6 * 4 * q2 * (1 - q2); }
    var squash = b < 0.06 ? 0.12 * (1 - b / 0.06) : 0;
    var cy = land.y - hop + squash * 10;
    return { x: land.x, y: cy, s: 1 - squash, rot: 0, op: 1, lift: land.y - cy };
  }
  function drawCoin(p) {
    if (!art.coin.complete || !art.coin.naturalWidth) return;
    var h = COIN * 93 / 100;
    ctx.save();
    ctx.globalAlpha = p.op; ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180); ctx.scale(p.s, p.s);
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 4 * dpr; ctx.shadowOffsetY = 1 * dpr;
    ctx.drawImage(art.coin, -COIN / 2, -h / 2, COIN, h);
    ctx.restore();
  }

  // ---------------------------------------------------------------- heart
  var HEART_GAP = 0.12;                                           // each heart leaves a beat after the last
  function heartPose(c, n) {
    if (c.burst === null || reduce) return null;
    var t = c.burst - n * HEART_GAP;
    if (t < 0 || !heartT[n]) return null;
    var start = burstCenter(), hover = { x: start.x - 18 + (n - (drop.hearts - 1) / 2) * 34, y: start.y - 105 - (n % 2) * 10 };
    if (t < 0.55) {                                                // pops up out of the burst with a little overshoot
      var p = t / 0.55, e = easeOutBack(p);
      return { x: start.x + (hover.x - start.x) * e, y: start.y + (hover.y - start.y) * e,
               s: p < 0.6 ? 1.25 * p / 0.6 : 1.25 - 0.25 * (p - 0.6) / 0.4, glow: 1 };
    }
    if (t < HEART_FLY) return { x: hover.x, y: hover.y - 4 * Math.sin((t - 0.55) * 9), s: 1 + 0.07 * Math.sin((t - 0.55) * 14), glow: 1 };
    var k = (t - HEART_FLY) / HEART_DUR;
    if (k >= 1) return null;
    var e2 = k * k * (3 - 2 * k);
    var pos = bez(hover, { x: hover.x - 40, y: (hover.y + heartT[n].y) / 2 }, heartT[n], e2);
    return { x: pos.x, y: pos.y, s: 1 - 0.18 * e2, glow: 1 - 0.6 * e2 };
  }
  function drawHeart(p) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, HEART * 0.95 * p.s);
    g.addColorStop(0, "rgba(255,140,191," + (0.75 * p.glow).toFixed(3) + ")"); g.addColorStop(1, "rgba(255,140,191,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, HEART * p.s, 0, TAU); ctx.fill();
    ctx.restore();
    if (!art["heart-full"].complete || !art["heart-full"].naturalWidth) return;
    var w = HEART * p.s, h = w * 81 / 88;
    ctx.drawImage(art["heart-full"], p.x - w / 2, p.y - h / 2, w, h);
  }

  // ---------------------------------------------------------------- light
  function star(x, y, r) {
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4 - Math.PI / 2, len = k % 2 === 0 ? r : r * 0.26;
      if (k === 0) ctx.moveTo(x + Math.cos(a) * len, y + Math.sin(a) * len); else ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    ctx.closePath(); ctx.fill();
  }
  // A soft halo under a crisp core reads as light rather than a dot.
  function sparkle(x, y, radius, col, op, isStar) {
    if (op <= 0.01 || radius <= 0.2) return;
    var halo = radius * 2.6, g = ctx.createRadialGradient(x, y, 0, x, y, halo);
    g.addColorStop(0, rgba(col, 0.45 * op)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, halo, 0, TAU); ctx.fill();
    if (isStar) {
      ctx.fillStyle = rgba(col, op); star(x, y, radius);
      ctx.fillStyle = rgba([255, 255, 255], op); star(x, y, radius * 0.55);
    } else {
      ctx.fillStyle = rgba([255, 255, 255], op); ctx.beginPath(); ctx.arc(x, y, radius / 2, 0, TAU); ctx.fill();
    }
  }
  function shard(x, y, size, angle, col, op) {
    var pts = [[0, -1.6], [0.7, 0], [0, 1], [-0.7, 0]], ca = Math.cos(angle), sa = Math.sin(angle);
    ctx.beginPath();
    pts.forEach(function (pt, n) {
      var px = x + (pt[0] * ca - pt[1] * sa) * size, py = y + (pt[0] * sa + pt[1] * ca) * size;
      if (n === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = rgba(col, op); ctx.fill();
    ctx.strokeStyle = rgba([255, 255, 255], 0.7 * op); ctx.lineWidth = 0.6; ctx.stroke();
  }
  function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, TAU); }

  /* Floor shadows, the aura and the trail: everything behind the crystal. */
  function drawBehind(c, pose) {
    if (c.fall < 0) return;
    var burstFade = c.burst === null ? 1 : Math.max(0, 1 - c.burst / 0.2);
    // The crystal's shadow grows and darkens as it nears the floor.
    var near = Math.max(0, 1 - pose.lift / 380), r = 33 * (0.4 + 0.6 * near);
    ctx.save();
    ctx.translate(rest.x, rest.y); ctx.scale(1, 0.24);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, "rgba(20,31,56," + (0.5 * near * burstFade * pose.op).toFixed(3) + ")"); g.addColorStop(1, "rgba(20,31,56,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.restore();
    // Coin shadows on the floor while they bounce.
    for (var i = 0; i < COINS; i++) {
      var cp = coinPose(i, c);
      if (!cp || cp.lift === null) continue;
      var k = Math.max(0, 1 - cp.lift / 160), land = coinLanding(i), w = 24 * (0.5 + 0.5 * k);
      ctx.fillStyle = "rgba(0,0,0," + (0.22 * k).toFixed(3) + ")"; ellipse(land.x, land.y + 15, w / 2, 3); ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // A soft aura that breathes, and flares white as it charges.
    var breathe = 0.75 + 0.25 * Math.sin(c.fall * TAU / 2.4);
    var aura = (0.55 * breathe + 0.45 * pose.white) * burstFade * pose.op, ar = 70 * (1 + 0.25 * pose.white);
    var ag = ctx.createRadialGradient(pose.cx, pose.cy, 4, pose.cx, pose.cy, ar);
    ag.addColorStop(0, "rgba(153,242,255," + (0.55 * aura).toFixed(3) + ")"); ag.addColorStop(0.5, "rgba(191,153,255," + (0.22 * aura).toFixed(3) + ")"); ag.addColorStop(1, "rgba(191,153,255,0)");
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(pose.cx, pose.cy, ar, 0, TAU); ctx.fill();
    // A trail of sparkles behind the falling crystal.
    if (!reduce && c.landed < 0.25) {
      for (var n = 1; n <= 12; n++) {
        var past = clockAt(drop.fallsAt + c.fall - n * 0.03);
        if (past.fall < 0 || past.landed >= 0) continue;
        var pp = crystalPose(past), fade = (1 - n / 13) * 0.85;
        sparkle(pp.cx + (rnd(n, 11) - 0.5) * 22, pp.cy + (rnd(n, 12) - 0.5) * 30, 1.2 + 3.5 * (1 - n / 13), color(n), fade, n % 3 === 0);
      }
    }
    ctx.restore();
  }

  /* Sparkles, the landing puff, the burst and the heart's arrival. */
  function drawInFront(c, pose) {
    if (c.fall < 0 || reduce) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var i, a, t;
    // Landing: a flat ring of light and sparkles skimming out along the floor.
    if (c.landed >= 0 && c.landed < 0.9) {
      t = c.landed;
      var ringP = Math.min(t / 0.6, 1), rw = 30 + 120 * easeOut(ringP);
      ctx.strokeStyle = "rgba(255,255,255," + (0.6 * (1 - ringP)).toFixed(3) + ")"; ctx.lineWidth = 2.5 * (1 - ringP) + 0.5;
      ellipse(rest.x, rest.y, rw / 2, rw * 0.09); ctx.stroke();
      for (i = 0; i < 12; i++) {
        a = Math.PI * (i + rnd(i, 13)) / 12;
        var d = (70 + rnd(i, 14) * 90) * easeOut(Math.min(t / 0.9, 1));
        sparkle(rest.x + Math.cos(a) * d, rest.y - Math.sin(a) * d * 0.45, 1.5 + rnd(i, 15) * 2, color(i), 1 - t / 0.9, i % 4 === 0);
      }
    }
    // Ambient sparkles drifting up from the base, once it has landed.
    if (c.landed >= 0 && c.burst === null) {
      var fadeIn = smooth(0, 0.8, c.landed);
      for (i = 0; i < 14; i++) {
        var period = 2.2 + rnd(i, 20) * 1.6, q = ((c.landed + rnd(i, 21) * period) % period) / period;
        var x = pose.cx + (rnd(i, 22) * 2 - 1) * 42 + Math.sin(q * TAU + rnd(i, 23) * 6) * 8;
        var y = rest.y - pose.lift - (4 + q * (70 + rnd(i, 24) * 50));
        var alpha = Math.pow(Math.sin(Math.PI * q), 1.5) * (0.6 + 0.4 * Math.sin(c.landed * 8 + i)) * fadeIn * (1 - pose.white);
        var isStar = i % 3 === 0;
        sparkle(x, y, isStar ? 3.5 + rnd(i, 25) * 3 : 1.4 + rnd(i, 26) * 1.8, color(i), alpha, isStar);
      }
      // A glint that flares on the tip as the shimmer passes it.
      if (pose.shimOp > 0.5) sparkle(pose.cx - 2, pose.cy - CH * 0.46, 9 * (pose.shimOp - 0.5) * 2, [255, 255, 255], 1, true);
    }
    // Charging: light streaks being drawn into the crystal.
    if (c.opened !== null && c.burst === null) {
      ctx.lineCap = "round"; ctx.lineWidth = 2;
      for (i = 0; i < 16; i++) {
        a = TAU * (i + rnd(i, 30)) / 16;
        var cc = (c.opened * 2.4 + rnd(i, 31)) % 1, r = 12 + 90 * (1 - cc);
        ctx.strokeStyle = rgba(color(i), cc * 0.9);
        ctx.beginPath(); ctx.moveTo(pose.cx + Math.cos(a) * r, pose.cy + Math.sin(a) * r);
        ctx.lineTo(pose.cx + Math.cos(a) * (r + 14), pose.cy + Math.sin(a) * (r + 14)); ctx.stroke();
      }
    }
    // The burst: a flash, a ring of light, shards and stars.
    if (c.burst !== null && c.burst < 2.8) {
      t = c.burst;
      var ctr = burstCenter(), flashP = Math.min(t / 0.35, 1), fr = 30 + 140 * easeOut(flashP);
      var fg = ctx.createRadialGradient(ctr.x, ctr.y, 0, ctr.x, ctr.y, fr);
      fg.addColorStop(0, "rgba(255,255,255," + (0.95 * (1 - flashP)).toFixed(3) + ")"); fg.addColorStop(0.5, "rgba(179,242,255," + (0.4 * (1 - flashP)).toFixed(3) + ")"); fg.addColorStop(1, "rgba(179,242,255,0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ctr.x, ctr.y, fr, 0, TAU); ctx.fill();
      var rp = Math.min(t / 0.55, 1), rr = 20 + 165 * easeOut(rp);
      ctx.strokeStyle = "rgba(217,247,255," + (0.85 * (1 - rp)).toFixed(3) + ")"; ctx.lineWidth = 3.5 * (1 - rp) + 0.5;
      ctx.beginPath(); ctx.arc(ctr.x, ctr.y, rr, 0, TAU); ctx.stroke();
      for (i = 0; i < 24; i++) {
        var life = 0.7 + rnd(i, 40) * 0.45;
        if (t >= life) continue;
        a = TAU * (i + rnd(i, 41) * 0.8) / 24;
        var speed = 180 + rnd(i, 42) * 190;
        var px = ctr.x + Math.cos(a) * speed * t, py = ctr.y + Math.sin(a) * speed * t + 0.5 * 620 * t * t, fade = 1 - t / life;
        if (i % 2 === 0) shard(px, py, 4 + rnd(i, 43) * 5, a + t * (rnd(i, 44) * 14 - 7), color(i), fade);
        else sparkle(px, py, 3 + rnd(i, 45) * 4, color(i), fade * (0.6 + 0.4 * Math.sin(t * 30 + i)), true);
      }
      // A little burst of light where each heart lands in its slot.
      for (var n = 0; n < drop.hearts && n < heartT.length; n++) {
        var since = t - n * HEART_GAP - (HEART_FLY + HEART_DUR);
        if (since < 0 || since >= 0.5) continue;
        var hp = since / 0.5;
        for (i = 0; i < 8; i++) {
          a = TAU * i / 8;
          var hd = 6 + 22 * easeOut(hp);
          sparkle(heartT[n].x + Math.cos(a) * hd, heartT[n].y + Math.sin(a) * hd, 2.5, [255, 191, 230], 1 - hp, true);
        }
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- rewards and the loop
  function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  function rewards(c) {
    if (c.burst === null || drop.done) return;
    var t = c.burst;
    if (reduce) {
      drop.arrived = COINS; bucksEl.textContent = drop.amount; fillHearts(drop.hearts);
      if (t > 0.3) { drop.done = true; showWin(); }
      return;
    }
    // The balance counts up to the amount as the coins fly in.
    while (drop.arrived < COINS && t >= collectStart(drop.arrived) + COLLECT) {
      drop.arrived++; bucksEl.textContent = Math.round(drop.amount * drop.arrived / COINS); bump(pill);
    }
    while (drop.heartsIn < drop.hearts && t >= drop.heartsIn * HEART_GAP + HEART_FLY + HEART_DUR) { drop.heartsIn++; fillHearts(drop.heartsIn); }
    var last = (drop.hearts - 1) * HEART_GAP + HEART_FLY + HEART_DUR + 0.5;
    if (t >= Math.max(collectStart(COINS - 1) + COLLECT, last) + 0.2) { drop.done = true; showWin(); }
  }

  function tick() {
    frame = 0;
    if (!visible || !drop) return;
    var t = now(), c = clockAt(t);
    rewards(c);
    var open = canOpen(c);
    if (hit.disabled === open) hit.disabled = !open;
    stage.classList.toggle("ready", open && c.landed > 0.6);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (drop.done && c.burst > 2.4) return;                 // the show is over; the panel takes it from here
    var pose = crystalPose(c);
    drawBehind(c, pose);
    drawCrystal(pose);
    for (var i = 0; i < COINS; i++) { var cp = coinPose(i, c); if (cp) drawCoin(cp); }
    for (var h = 0; h < drop.hearts; h++) { var hp = heartPose(c, h); if (hp) drawHeart(hp); }
    drawInFront(c, pose);
    frame = requestAnimationFrame(tick);
  }
  function run() { if (!frame && visible && drop) frame = requestAnimationFrame(tick); }

  // Skip to the end of the burst (the animation only runs while the crystal is on screen).
  function finishNow() {
    if (!drop || drop.burstAt === null || drop.done) return;
    drop.done = true; drop.arrived = COINS;
    bucksEl.textContent = drop.amount; fillHearts(drop.hearts);
    showWin();
  }
  function failed(text) {
    drop.openedAt = null; drop.burstAt = null;              // back to hovering; it can be tapped again
    hint.textContent = text;
  }
  hit.addEventListener("click", function () {
    if (!drop || !rollUrl || !canOpen(clockAt(now()))) return;
    var mine = drop;
    mine.openedAt = now();
    hint.textContent = HINT;
    dockCheck();                                          // it's being opened: no more nudging
    if (navigator.vibrate && !reduce) { try { navigator.vibrate([8, 190, 10, 150, 14, 130, 18, 100, 40]); } catch (e) { /* not allowed here */ } }
    fetch(rollUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mine !== drop) return;
        if (d && d.status === "ok" && typeof d.id === "string" && d.amount >= 30 && d.amount <= 100) {
          mine.amount = Math.round(d.amount);
          mine.hearts = Math.min(3, Math.max(1, Math.round(d.hearts) || 1));
          won = { id: d.id, amount: mine.amount, hearts: mine.hearts, expires: Date.parse(d.expires_at) || Date.now() + 6e5, saved: false };
          mine.burstAt = Math.max(mine.openedAt + CHARGE, now());
          writeWon(won);
          showWin();                                          // the countdown starts now, not after the show
          if (!visible) finishNow();
        } else if (d && d.status === "rate_limited") {
          failed("Too many crystals from this network today. Try again tomorrow.");
        } else { failed("Couldn't reach us. Tap it again."); }
      })
      .catch(function () { if (mine === drop) failed("Couldn't reach us. Tap it again."); });
  });
  claim.addEventListener("click", function () {
    setTimeout(function () { var e = document.getElementById("access-email"); if (e && e.offsetParent) e.focus({ preventScroll: true }); }, 700);
  });
  window.addEventListener("resize", function () { layout(); });

  won = readWon();
  showWin();
  measure();                                              // the nudge in "Get Mochi" is right from the start
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (!visible) finishNow();                                // scrolled away mid-burst: skip to the end
    if (visible) {
      layout();
      if (!drop && !won) newDrop(0.35);
      run();
    }
  }, { threshold: 0.35 }).observe(stage);
})();
