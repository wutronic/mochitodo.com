/* The daily crystal, as it behaves in the app.
   A port of HeartPals/Components/CrystalDropView.swift: same timings, same motion. It falls with
   a sparkle trail, lands with a squash and a ring of light, hovers with a shimmer and drifting
   sparkles. Tapped, it turns white, shakes harder and harder, and bursts: Mochi Bucks arc out,
   bounce on the floor and fly into the balance, and a heart floats up into its slot.
   Every position is a function of the time since the fall, the tap or the burst.

   What the crystal pays is NOT decided here. On the tap this asks the server (the crystal-roll
   function), which picks 30 to 100 Mochi Bucks, stores the amount, and sends back an id. The
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
  var heartEl = document.getElementById("crystal-heart");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var total = document.getElementById("crystal-total"), totalNum = document.getElementById("crystal-total-n");
  var hint = stage.querySelector(".crystal-hint");
  var win = document.getElementById("crystal-win"), wonEl = document.getElementById("crystal-won");
  var winText = document.getElementById("crystal-win-text"), winTimer = document.getElementById("crystal-win-timer");
  var leftEl = document.getElementById("crystal-left"), claim = document.getElementById("crystal-claim");
  var rollUrl = stage.getAttribute("data-roll");
  var HINT = hint.textContent, KEY = "mochi-crystal";

  var CW = 82, CH = 82 * 420 / 320, COIN = 30, HEART = 34, COINS = 10;
  var FALL = reduce ? 0.35 : 0.95, CHARGE = reduce ? 0.3 : 0.62;
  var COLLECT = 0.5, HEART_FLY = 1.05, HEART_DUR = 0.65;
  var PALETTE = [[158, 242, 255], [204, 179, 255], [255, 247, 255], [255, 199, 242]];
  var TAU = Math.PI * 2;

  var art = {};
  ["crystal", "coin", "heart-full"].forEach(function (name) {
    var im = new Image(); im.src = "/images/app/" + name + ".png"; art[name] = im;
  });
  var scratch = document.createElement("canvas"), sctx = scratch.getContext("2d");

  var W = 0, H = 0, dpr = 1, rest = { x: 0, y: 0 }, bucksT = { x: 0, y: 0 }, heartT = { x: 0, y: 0 };
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
  function collectStart(i) { return 1.4 + i * 0.075; }

  function layout() {
    var r = stage.getBoundingClientRect();
    W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    rest = { x: W / 2, y: H - 44 };
    var p = pill.querySelector("img").getBoundingClientRect(), h = heartEl.getBoundingClientRect();
    bucksT = { x: p.left + p.width / 2 - r.left, y: p.top + p.height / 2 - r.top };
    heartT = { x: h.left + h.width / 2 - r.left, y: h.top + h.height / 2 - r.top };
  }

  function newDrop(delay) {
    drop = { seed: Math.random() * 1000, fallsAt: now() + delay, openedAt: null, burstAt: null, amount: 0,
             arrived: 0, heart: false, done: false, cleared: false };
  }

  function readWon() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { v = window.__mochiCrystal || null; }
    if (!v || typeof v.id !== "string" || !(v.amount >= 30 && v.amount <= 100)) return null;
    if (!v.saved && !(v.expires > Date.now())) return null;      // ran out before it was claimed
    return { id: v.id, amount: Math.round(v.amount), expires: v.expires, saved: !!v.saved };
  }
  function writeWon(v) {
    window.__mochiCrystal = v;
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* private window */ }
    window.dispatchEvent(new CustomEvent("mochi-crystal"));
  }
  function clock2(n) { return (n < 10 ? "0" : "") + n; }
  /* The panel under the stage: what you won, that it is yours, and how long you have. */
  function showWin() {
    var has = !!won && (!drop || drop.done || drop.burstAt === null);
    win.hidden = !has; total.hidden = !has;
    stage.classList.toggle("won", has);
    if (!has) return;
    bucksEl.textContent = won.amount; totalNum.textContent = won.amount; wonEl.textContent = won.amount;
    heartEl.classList.add("on");
    if (won.saved) {
      winText.textContent = "They are saved to the email you signed up with. Log in to the app with that email and they are added to your account.";
      winTimer.hidden = true; claim.hidden = true;
    } else {
      winText.textContent = "Sign up now and they are added to your account the first time you log in to the app with the same email.";
      winTimer.hidden = false; claim.hidden = false;
      var left = Math.max(0, Math.floor((won.expires - Date.now()) / 1000));
      leftEl.textContent = clock2(Math.floor(left / 3600)) + ":" + clock2(Math.floor(left / 60) % 60) + ":" + clock2(left % 60);
    }
  }
  setInterval(function () {
    if (!won || won.saved) return;
    if (won.expires <= Date.now()) {          // unclaimed and out of time: it is gone, and a new crystal can fall
      won = null; writeWon(null); bucksEl.textContent = "0"; heartEl.classList.remove("on"); showWin();
      if (visible) { newDrop(0.4); run(); } else drop = null;
      return;
    }
    if (!win.hidden) showWin();
  }, 1000);
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
    var t = c.burst, launch = 0.02 * i + rnd(i, 3) * 0.05, flight = 0.55 + rnd(i, 4) * 0.12, local = t - launch;
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
  function heartPose(c) {
    if (c.burst === null || reduce) return null;
    var t = c.burst, start = burstCenter(), hover = { x: start.x - 18, y: start.y - 105 };
    if (t < 0.55) {                                                // pops up out of the burst with a little overshoot
      var p = t / 0.55, e = easeOutBack(p);
      return { x: start.x + (hover.x - start.x) * e, y: start.y + (hover.y - start.y) * e,
               s: p < 0.6 ? 1.25 * p / 0.6 : 1.25 - 0.25 * (p - 0.6) / 0.4, glow: 1 };
    }
    if (t < HEART_FLY) return { x: hover.x, y: hover.y - 4 * Math.sin((t - 0.55) * 9), s: 1 + 0.07 * Math.sin((t - 0.55) * 14), glow: 1 };
    var k = (t - HEART_FLY) / HEART_DUR;
    if (k >= 1) return null;
    var e2 = k * k * (3 - 2 * k);
    var pos = bez(hover, { x: hover.x - 40, y: (hover.y + heartT.y) / 2 }, heartT, e2);
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
    if (c.burst !== null && c.burst < 1.5) {
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
      // A little burst of light where the heart lands in its slot.
      var since = t - (HEART_FLY + HEART_DUR);
      if (since >= 0 && since < 0.5) {
        var hp = since / 0.5;
        for (i = 0; i < 8; i++) {
          a = TAU * i / 8;
          var hd = 6 + 22 * easeOut(hp);
          sparkle(heartT.x + Math.cos(a) * hd, heartT.y + Math.sin(a) * hd, 2.5, [255, 191, 230], 1 - hp, true);
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
      drop.arrived = COINS; bucksEl.textContent = drop.amount;
      if (!drop.heart) { drop.heart = true; heartEl.classList.add("on"); }
      if (t > 0.3) { drop.done = true; showWin(); }
      return;
    }
    // The balance counts up to the amount as the coins fly in.
    while (drop.arrived < COINS && t >= collectStart(drop.arrived) + COLLECT) {
      drop.arrived++; bucksEl.textContent = Math.round(drop.amount * drop.arrived / COINS); bump(pill);
    }
    if (!drop.heart && t >= HEART_FLY + HEART_DUR) { drop.heart = true; heartEl.classList.add("on"); }
    if (t >= Math.max(collectStart(COINS - 1) + COLLECT, HEART_FLY + HEART_DUR + 0.5) + 0.2) { drop.done = true; showWin(); }
  }

  function tick() {
    frame = 0;
    if (!visible || !drop) return;
    var t = now(), c = clockAt(t);
    if (c.fall >= 0 && !drop.cleared) { drop.cleared = true; if (!won) heartEl.classList.remove("on"); }
    rewards(c);
    var open = canOpen(c);
    if (hit.disabled === open) hit.disabled = !open;
    stage.classList.toggle("ready", open && c.landed > 1.2);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (drop.done && c.burst > 1.6) return;                 // the show is over; the panel takes it from here
    var pose = crystalPose(c);
    drawBehind(c, pose);
    drawCrystal(pose);
    for (var i = 0; i < COINS; i++) { var cp = coinPose(i, c); if (cp) drawCoin(cp); }
    var hp = heartPose(c); if (hp) drawHeart(hp);
    drawInFront(c, pose);
    frame = requestAnimationFrame(tick);
  }
  function run() { if (!frame && visible && drop) frame = requestAnimationFrame(tick); }

  function failed(text) {
    drop.openedAt = null; drop.burstAt = null;              // back to hovering; it can be tapped again
    hint.textContent = text;
  }
  hit.addEventListener("click", function () {
    if (!drop || !rollUrl || !canOpen(clockAt(now()))) return;
    var mine = drop;
    mine.openedAt = now();
    hint.textContent = HINT;
    if (navigator.vibrate && !reduce) { try { navigator.vibrate([8, 190, 10, 150, 14, 130, 18, 100, 40]); } catch (e) { /* not allowed here */ } }
    fetch(rollUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (mine !== drop) return;
        if (d && d.status === "ok" && typeof d.id === "string" && d.amount >= 30 && d.amount <= 100) {
          mine.amount = Math.round(d.amount);
          won = { id: d.id, amount: mine.amount, expires: Date.parse(d.expires_at) || Date.now() + 864e5, saved: false };
          writeWon(won);
          mine.burstAt = Math.max(mine.openedAt + CHARGE, now());
        } else if (d && d.status === "rate_limited") {
          failed("That's every crystal for today. Come back tomorrow.");
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
  new IntersectionObserver(function (entries) {
    visible = entries[0].isIntersecting;
    if (visible) {
      layout();
      if (!drop && !won) newDrop(0.35);
      run();
    }
  }, { threshold: 0.35 }).observe(stage);
})();
