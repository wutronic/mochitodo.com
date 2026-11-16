/* The crystal's win, as a pile of coins: one coin per Mochi Buck, raining into the stage and
   settling into a heap behind the present. Each coin is a circle with simple physics (gravity,
   walls, and coins pushing each other apart), so they stack, roll and jostle.

   Kept cheap: at most 100 coins, a few short steps per frame, one pre-drawn coin picture, and
   the loop sleeps as soon as the pile is still or off screen. A pointer or finger moving through
   the pile shoves coins aside; a tap kicks them up. With "reduce motion" on, the pile is worked
   out in one go and drawn once, already settled.

   While the prize is unclaimed, the pile doesn't stay: a moment after the last coin lands, every
   coin is pulled into the present, one after another, and the present gulps each one.

   Used by public/js/crystal.js: MochiCoinPile(stage, { target, onArrive }) returns
   { fill(n, gather), clear() }. target() gives the present's centre in stage pixels. */
(function () {
  window.MochiCoinPile = function (stage, opts) {
    opts = opts || {};
    var canvas = document.createElement("canvas");
    canvas.className = "coin-pile";
    canvas.setAttribute("aria-hidden", "true");
    var first = stage.querySelector("canvas");
    stage.insertBefore(canvas, first ? first.nextSibling : stage.firstChild);
    var ctx = canvas.getContext("2d");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var art = new Image(); art.src = "/images/app/coin.png";
    var coins = [], wanted = 0, dropped = 0, W = 0, H = 0, F = 0, dpr = 1, R = 14;   // F: the floor the coins land on
    var sprite = null, frame = 0, onScreen = false, still = 0, lastT = 0, spawnAcc = 0;
    var pointer = null, pointerTimer = 0;               // {x, y, vx, vy} while it moves over the stage
    var settling = 0;                                   // frames since the last coin dropped
    var gather = false, phase = "idle", landedAt = 0, gatherAt = 0;   // phase: idle, rain, gather, done
    var HOLD = 0.5, FLY = 0.42, GAP = 0.009;            // seconds: heap on show, each flight, between coins

    var G = 1500, STEPS = 3, SPAWN_PER_S = 95, DAMP = 0.988, FLOOR_FRICTION = 0.85;   // soft: they settle rather than bounce

    function size() {
      var r = stage.getBoundingClientRect();
      W = r.width; H = r.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      // When the prize panel sits inside the stage, its top is the floor: the coins heap up on it.
      var panel = stage.querySelector(".crystal-win.in-stage");
      F = panel ? Math.max(panel.offsetTop, H * 0.4) : H;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      // Coins big enough to read, small enough that the whole win fits in about the lower 60%.
      R = Math.max(9, Math.min(17, Math.sqrt((W * F * 0.6) / (Math.max(wanted, 1) * 3.6))));
      coins.forEach(function (c) { c.r = R; c.x = Math.min(Math.max(c.x, R), W - R); c.px = c.x; });
      makeSprite();
    }
    // One coin, drawn once with its shadow, then stamped for every coin.
    function makeSprite() {
      if (!art.complete || !art.naturalWidth) return;
      var d = Math.ceil((R * 2 + 6) * dpr);
      sprite = document.createElement("canvas"); sprite.width = d; sprite.height = d;
      var s = sprite.getContext("2d");
      s.shadowColor = "rgba(31,63,87,0.35)"; s.shadowBlur = 3 * dpr; s.shadowOffsetY = 1.5 * dpr;
      var w = R * 2 * dpr, h = w * 93 / 100;
      s.drawImage(art, (d - w) / 2, (d - h) / 2, w, h);
    }
    art.addEventListener("load", function () { makeSprite(); draw(); });

    function spawn() {
      var x = R + Math.random() * (W - 2 * R);
      var y = -R - Math.random() * 40;
      var vx = (Math.random() - 0.5) * 3;
      coins.push({ x: x, y: y, px: x - vx, py: y - 2, r: R, a: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.3 });
      dropped++;
    }

    function step(dt) {
      var i, j, c, d, n = coins.length, g = G * dt * dt;
      for (i = 0; i < n; i++) {                        // move (Verlet): velocity is the last step's move
        c = coins[i];
        var vx = (c.x - c.px) * DAMP, vy = (c.y - c.py) * DAMP;
        c.px = c.x; c.py = c.y;
        c.x += vx; c.y += vy + g;
        c.a += vx / c.r + c.spin * 0.02;
        c.spin *= 0.98;
      }
      if (pointer) {                                    // the pointer pushes coins out of its way
        var pr = R * 3.2;
        for (i = 0; i < n; i++) {
          c = coins[i];
          var dx = c.x - pointer.x, dy = c.y - pointer.y, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < pr && dist > 0.01) {
            var push = (pr - dist) / pr;
            c.x += dx / dist * push * 2.2 + pointer.vx * 0.04 * push;
            c.y += dy / dist * push * 2.2 + pointer.vy * 0.04 * push;
          }
        }
      }
      for (var pass = 0; pass < 3; pass++)              // three passes keep stacks steady instead of jittering
      for (i = 0; i < n; i++) {                         // coins push each other apart
        c = coins[i];
        for (j = i + 1; j < n; j++) {
          d = coins[j];
          var ox = d.x - c.x, oy = d.y - c.y, min = c.r + d.r;
          if (ox > min || ox < -min || oy > min || oy < -min) continue;
          var dd = ox * ox + oy * oy;
          if (dd >= min * min || dd === 0) continue;
          var dist2 = Math.sqrt(dd), over = (min - dist2) * 0.5, nx = ox / dist2, ny = oy / dist2;
          c.x -= nx * over; c.y -= ny * over;
          d.x += nx * over; d.y += ny * over;
        }
      }
      for (i = 0; i < n; i++) {                         // walls and floor
        c = coins[i];
        if (c.x < c.r) { c.x = c.r; c.px = c.x + (c.x - c.px) * 0.3; }
        else if (c.x > W - c.r) { c.x = W - c.r; c.px = c.x + (c.x - c.px) * 0.3; }
        if (c.y > F - c.r) {
          c.y = F - c.r;
          c.py = c.y + (c.y - c.py) * 0.08;             // barely a bounce
          c.px = c.x - (c.x - c.px) * FLOOR_FRICTION;   // and it slows as it rolls
        }
      }
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!sprite) return;
      var half = sprite.width / dpr / 2;
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (c.gone) continue;
        var k = c.s === undefined ? 1 : c.s;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
        if (c.o !== undefined) ctx.globalAlpha = c.o;
        ctx.drawImage(sprite, -half * k, -half * k, half * 2 * k, half * 2 * k);
        ctx.restore();
      }
    }

    function moving() {
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (Math.abs(c.x - c.px) > 0.08 || Math.abs(c.y - c.py) > 0.08) return true;
      }
      return false;
    }

    function tick(t) {
      frame = 0;
      if (!onScreen) return;
      var dt = Math.min((t - (lastT || t)) / 1000, 1 / 30);
      lastT = t;
      if (dropped < wanted) {
        spawnAcc += dt * SPAWN_PER_S;
        while (spawnAcc >= 1 && dropped < wanted) { spawn(); spawnAcc -= 1; }
      }
      if (phase === "gather") {                         // into the present, one after another
        if (flyIn(t / 1000)) { phase = "done"; coins = []; draw(); lastT = 0; return; }
        draw();
        frame = requestAnimationFrame(tick);
        return;
      }
      for (var s = 0; s < STEPS; s++) step(1 / 60 / STEPS);
      draw();
      if (gather && dropped >= wanted) {
        if (!landedAt) landedAt = t / 1000;
        if (t / 1000 - landedAt > HOLD && startGather(t / 1000)) { frame = requestAnimationFrame(tick); return; }
      }
      // Sleep once everything has landed and nothing has moved for half a second (or, failing
      // that, eight seconds after the last coin, so a tiny wobble in a stack can't keep it busy).
      settling = dropped >= wanted && !pointer ? settling + 1 : 0;
      still = dropped >= wanted && !pointer && !moving() ? still + 1 : 0;
      if (!gather && (still > 30 || settling > 480)) {
        coins.forEach(function (c) { c.px = c.x; c.py = c.y; });   // rest exactly where they are
        lastT = 0; settling = 0; return;
      }
      frame = requestAnimationFrame(tick);
    }
    function wake() { still = 0; if (!frame && onScreen && !reduce) frame = requestAnimationFrame(tick); }

    // Every coin flies into the present: nearest first, each on a little arc, shrinking as it goes.
    function startGather(now) {
      var tgt = opts.target && opts.target();
      if (!tgt) return false;
      phase = "gather"; pointer = null;
      coins.forEach(function (c) { c.d = (c.x - tgt.x) * (c.x - tgt.x) + (c.y - tgt.y) * (c.y - tgt.y); });
      coins.sort(function (a, b) { return a.d - b.d; });
      coins.forEach(function (c, i) {
        c.sx = c.x; c.sy = c.y; c.t0 = now + i * GAP; c.tx = tgt.x; c.ty = tgt.y;
        c.cx = (c.x + tgt.x) / 2 + (c.x < tgt.x ? -1 : 1) * 30; c.cy = Math.min(c.y, tgt.y) - 70 - Math.random() * 40;
      });
      return true;
    }
    function flyIn(now) {
      var left = 0;
      for (var i = 0; i < coins.length; i++) {
        var c = coins[i];
        if (c.gone) continue;
        var p = (now - c.t0) / FLY;
        if (p < 0) { left++; continue; }
        if (p >= 1) { c.gone = true; if (opts.onArrive) opts.onArrive(); continue; }
        left++;
        var e = p * p * (3 - 2 * p), u = 1 - e;
        c.x = u * u * c.sx + 2 * u * e * c.cx + e * e * c.tx;
        c.y = u * u * c.sy + 2 * u * e * c.cy + e * e * c.ty;
        c.s = 1 - 0.65 * e; c.o = p > 0.8 ? (1 - p) / 0.2 : 1; c.a += 0.25;
      }
      return left === 0;
    }

    function settleNow() {                               // reduced motion: work it all out, draw once
      while (dropped < wanted) spawn();
      coins.forEach(function (c, i) { c.y = F - R - (i % 12) * R * 1.6; c.py = c.y; });
      for (var k = 0; k < 900; k++) step(1 / 60 / STEPS);
      coins.forEach(function (c) { c.px = c.x; c.py = c.y; });
      draw();
    }

    // Pointer and finger: shove the coins around.
    function at(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    stage.addEventListener("pointermove", function (e) {
      if (!coins.length || reduce || phase === "gather") return;
      var p = at(e);
      pointer = { x: p.x, y: p.y, vx: pointer ? p.x - pointer.x : 0, vy: pointer ? p.y - pointer.y : 0 };
      clearTimeout(pointerTimer);
      pointerTimer = setTimeout(function () { pointer = null; }, 150);   // a resting pointer pushes nothing
      wake();
    });
    stage.addEventListener("pointerleave", function () { pointer = null; });
    stage.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") pointer = null; });
    stage.addEventListener("pointercancel", function () { pointer = null; });
    stage.addEventListener("pointerdown", function (e) {
      if (!coins.length || reduce || phase === "gather") return;
      var p = at(e);
      coins.forEach(function (c) {                       // a tap kicks nearby coins up
        var dx = c.x - p.x, dy = c.y - p.y, dist = Math.sqrt(dx * dx + dy * dy), reach = R * 7;
        if (dist < reach) { var k = (reach - dist) / reach; c.py += 9 * k; c.px -= dx / (dist || 1) * 4 * k; }
      });
      wake();
    });

    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen) wake(); else if (frame) { cancelAnimationFrame(frame); frame = 0; lastT = 0; }
    }).observe(stage);
    window.addEventListener("resize", function () { size(); draw(); wake(); });
    if ("ResizeObserver" in window) new ResizeObserver(function () { if (wanted) { size(); draw(); wake(); } }).observe(stage);   // the stage grows when the prize moves in

    return {
      fill: function (n, intoPresent) {
        n = Math.max(0, Math.min(100, Math.round(n) || 0));
        if (n === wanted && phase !== "idle") return;     // once per win: it never rains twice
        coins = []; dropped = 0; wanted = n; spawnAcc = 0; landedAt = 0;
        gather = !!intoPresent; phase = "rain";
        size();
        if (reduce) { if (gather) { phase = "done"; draw(); } else settleNow(); }
        else wake();
      },
      clear: function () { coins = []; wanted = 0; dropped = 0; phase = "idle"; draw(); }
    };
  };
})();
