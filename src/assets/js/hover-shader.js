/*
 * Hover shader: on mouseover, text elements are rasterized to a texture and
 * re-rendered on an overlay canvas as a lightly raymarched heightfield —
 * monotone 3D with speckled shadows. The canvas never takes pointer events,
 * and the original text stays in the DOM, so everything remains selectable.
 */
(function () {
  "use strict";

  // No hover on touch-only devices; skip entirely.
  if (window.matchMedia("(hover: none)").matches) return;
  // CV lines use a year|entry grid; the shader rasterizer collapses that gap.
  if (document.body.classList.contains("cv-page")) return;

  var SELECTOR = "h1, h2, h3, p, li, nav a, footer a";
  var PAD = 28; // px of breathing room around the element for warp/shadow
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  var VERT = [
    "attribute vec2 aPos;",
    "void main() { gl_Position = vec4(aPos, 0.0, 1.0); }",
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "uniform sampler2D uText;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec2 uMouse;",
    "uniform float uAmt;",
    "uniform float uOpacity;",
    "uniform vec3 uInk;",
    "",
    "float gAmt; // effect strength at this fragment (gradient toward mouse)",
    "",
    "float hash(vec2 p) {",
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);",
    "}",
    "",
    "float textAt(vec2 uv) {",
    "  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;",
    "  return texture2D(uText, uv).a;",
    "}",
    "",
    "// Gentle domain warp (driven by time + hover amount) that makes the",
    "// letters swim almost imperceptibly. Zero when the effect is idle.",
    "vec2 warp(vec2 uv) {",
    "  float w = 0.0035 * gAmt;",
    "  return uv + w * vec2(",
    "    sin(uv.y * 42.0 + uTime * 1.1) + sin(uv.y * 13.0 - uTime * 0.7),",
    "    cos(uv.x * 37.0 - uTime * 0.9) + cos(uv.x * 11.0 + uTime * 0.5)",
    "  );",
    "}",
    "",
    "// Heightfield for the raymarch: the text as a shallow relief.",
    "float H(vec2 uv) {",
    "  return smoothstep(0.15, 0.85, textAt(warp(uv)));",
    "}",
    "",
    "void main() {",
    "  vec2 uv = gl_FragCoord.xy / uRes;",
    "  float aspect = uRes.x / uRes.y;",
    "",
    "  // The effect is a gradient centered on the mouse: full strength at",
    "  // the cursor, easing back to flat ink further away.",
    "  float d = length((uv - uMouse) * vec2(aspect, 1.0));",
    "  gAmt = uAmt * smoothstep(1.6, 0.0, d);",
    "  float depth = 0.05 * gAmt + 0.001;",
    "",
    "  // Camera: orthographic-ish rays, tilted slightly toward the mouse so",
    "  // the relief parallaxes as you move over it. Clamped so letters far",
    "  // from the cursor do not smear.",
    "  vec3 ro = vec3(uv, depth * 2.5 + 0.02);",
    "  vec2 tilt = clamp((uMouse - uv) * 0.14, -0.045, 0.045) * gAmt;",
    "  vec3 rd = normalize(vec3(tilt, -1.0));",
    "",
    "  float t = 0.0;",
    "  vec3 p = ro;",
    "  bool hit = false;",
    "  for (int i = 0; i < 48; i++) {",
    "    p = ro + rd * t;",
    "    float h = H(p.xy) * depth;",
    "    if (p.z <= h + 0.0005) { hit = true; break; }",
    "    t += max(0.004, (p.z - h) * 0.6);",
    "    if (t > 1.0) break;",
    "  }",
    "  if (!hit) { gl_FragColor = vec4(0.0); return; }",
    "",
    "  // Composite with the RAW texture alpha sampled at the SCREEN",
    "  // position (not the ray hit point). Two reasons: thresholded height",
    "  // fattens antialiased edges, and sampling at the hit point paints",
    "  // the extrusion's side walls, dilating every glyph by a dark rim —",
    "  // both read as bolder, darker text. This keeps the letter coverage",
    "  // identical to the DOM text; the raymarch only shades the interior.",
    "  float aRaw = textAt(warp(uv));",
    "  if (aRaw <= 0.003) { gl_FragColor = vec4(0.0); return; }",
    "  // The SVG rasterizer antialiases a touch heavier than DOM text;",
    "  // this curve thins the edge halos back to the DOM's visual weight.",
    "  aRaw = pow(aRaw, 1.6);",
    "",
    "  // Normal from the height gradient.",
    "  vec2 e = vec2(2.0 / uRes.y, 0.0);",
    "  float scale = depth / (2.0 * e.x);",
    "  vec3 n = normalize(vec3(",
    "    (H(p.xy - e.xy) - H(p.xy + e.xy)) * scale,",
    "    (H(p.xy - e.yx) - H(p.xy + e.yx)) * scale,",
    "    1.0",
    "  ));",
    "",
    "  vec3 ld = normalize(vec3(-0.45, 0.55, 0.65));",
    "  float dif = clamp(dot(n, ld), 0.0, 1.0);",
    "",
    "  // March a short ray toward the light for self-shadowing. Shadows",
    "  // stay soft (0.4 floor) so the hovered text never reads darker",
    "  // overall than the flat ink it replaces.",
    "  float sh = 1.0;",
    "  float st = 0.006;",
    "  for (int i = 0; i < 24; i++) {",
    "    vec3 sp = p + ld * st;",
    "    if (sp.z > depth) break;",
    "    if (sp.z < H(sp.xy) * depth - 0.001) { sh = 0.4; break; }",
    "    st += 0.008;",
    "  }",
    "",
    "  float shade = 0.35 + 0.65 * dif * sh;",
    "",
    "  // Randomness: speckles that live only in the shadowed regions.",
    "  float spk = hash(floor(gl_FragCoord.xy / (1.5 * max(1.0, uRes.y / 400.0)))",
    "                   + floor(uTime * 7.0) * 0.61803);",
    "  float darkness = 1.0 - shade;",
    "  shade += darkness * (spk - 0.5) * 0.5;",
    "  shade = clamp(shade, 0.0, 1.0);",
    "",
    "  // Monotone ink: lit faces are lighter ink, shadows are deeper.",
    "  vec3 relief = uInk + (1.0 - uInk) * shade * 0.55;",
    "",
    "  // Far from the mouse the letters render as plain flat ink, so the",
    "  // overlay is indistinguishable from the real text underneath.",
    "  vec3 col = mix(uInk, relief, gAmt);",
    "",
    "  gl_FragColor = vec4(col * aRaw, aRaw * uOpacity);",
    "}",
  ].join("\n");

  // ---------------------------------------------------------------------
  // WebGL setup (one shared canvas + context, repositioned per element)
  // ---------------------------------------------------------------------

  var canvas = document.createElement("canvas");
  canvas.className = "hover-shader-canvas";
  document.body.appendChild(canvas);

  var gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  if (!gl) return;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  var aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var U = {
    res: gl.getUniformLocation(prog, "uRes"),
    time: gl.getUniformLocation(prog, "uTime"),
    mouse: gl.getUniformLocation(prog, "uMouse"),
    amt: gl.getUniformLocation(prog, "uAmt"),
    opacity: gl.getUniformLocation(prog, "uOpacity"),
    ink: gl.getUniformLocation(prog, "uInk"),
    text: gl.getUniformLocation(prog, "uText"),
  };

  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U.text, 0);
  gl.uniform3f(U.ink, 0.067, 0.067, 0.067);

  // ---------------------------------------------------------------------
  // Rasterizing DOM text to a texture, with the site fonts embedded
  // ---------------------------------------------------------------------

  var fontCSSPromise = null;
  function getFontCSS() {
    if (fontCSSPromise) return fontCSSPromise;
    // font-style must match the page's @font-face declarations exactly —
    // otherwise the browser's font matching inside the SVG picks a
    // different face (or synthesizes a slant) and the metrics drift.
    var fonts = [
      { family: "RegTimes", style: "normal", url: "/assets/fonts/RegTimes.otf" },
      { family: "ANRT Baskerville", style: "italic", url: "/assets/fonts/RegItalicAnrtBask.otf" },
    ];
    fontCSSPromise = Promise.all(
      fonts.map(function (f) {
        return fetch(f.url)
          .then(function (r) { return r.arrayBuffer(); })
          .then(function (ab) {
            var bytes = new Uint8Array(ab);
            var bin = "";
            for (var i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode.apply(
                null,
                bytes.subarray(i, i + 0x8000)
              );
            }
            return (
              "@font-face{font-family:'" + f.family + "';" +
              "font-style:" + f.style + ";" +
              "src:url(data:font/otf;base64," + btoa(bin) +
              ") format('opentype');}"
            );
          });
      })
    ).then(function (rules) {
      return rules.join("");
    });
    return fontCSSPromise;
  }

  var STYLE_PROPS = [
    "font-family", "font-size", "font-weight", "font-style",
    "line-height", "letter-spacing", "word-spacing", "text-transform",
    "text-align", "text-indent", "white-space", "text-decoration-line",
    "text-underline-offset", "padding", "list-style", "display",
    "vertical-align",
  ];

  // Copy computed styles onto every descendant of the clone so nested
  // elements (links with their own font/size/margins, spans, etc.) render
  // in the SVG exactly as they do in the page.
  function inlineDescendantStyles(el, clone) {
    var srcNodes = el.querySelectorAll("*");
    var dstNodes = clone.querySelectorAll("*");
    for (var i = 0; i < srcNodes.length; i++) {
      var cs = getComputedStyle(srcNodes[i]);
      var css = "";
      for (var j = 0; j < STYLE_PROPS.length; j++) {
        css += STYLE_PROPS[j] + ":" + cs.getPropertyValue(STYLE_PROPS[j]) + ";";
      }
      css += "margin:" + cs.getPropertyValue("margin") + ";";
      css += "color:#000;";
      dstNodes[i].setAttribute("style", css);
    }
  }

  function rasterize(el, rect) {
    return getFontCSS().then(function (fontCSS) {
      var cs = getComputedStyle(el);
      var rootStyle = STYLE_PROPS.map(function (p) {
        return p + ":" + cs.getPropertyValue(p) + ";";
      }).join("");
      // The root clone must carry its own styles inline, with margins
      // zeroed — otherwise UA defaults (e.g. a <p>'s 1em margin) reflow
      // the text inside the texture and the overlay lands offset from the
      // real element.
      rootStyle += "margin:0;color:#000;";

      var clone = el.cloneNode(true);
      clone.removeAttribute("id");
      clone.setAttribute("style", rootStyle);
      inlineDescendantStyles(el, clone);
      // Render at device resolution (scale the HTML up inside a DPR-sized
      // SVG) so the texture is pixel-crisp and matches the DOM text weight.
      var html =
        '<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;' +
        "width:" + rect.width + "px;" +
        "transform:scale(" + DPR + ");transform-origin:0 0;" + '">' +
        new XMLSerializer().serializeToString(clone) +
        "</div>";

      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        Math.ceil(rect.width * DPR) + '" height="' +
        Math.ceil(rect.height * DPR) +
        '"><style>' + fontCSS +
        "*{color:#000;}" +
        '</style><foreignObject width="100%" height="100%">' +
        html +
        "</foreignObject></svg>";

      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Hover lifecycle
  // ---------------------------------------------------------------------

  var active = null; // { el, rect, raf, amt, target, opacity, opacityTarget, textHidden, start }
  var pointer = { x: -1e4, y: -1e4 }; // client coords, tracked globally
  var texCanvas = document.createElement("canvas");
  var texCtx = texCanvas.getContext("2d");

  document.addEventListener("mousemove", function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });

  function showText(a) {
    if (!a.textHidden) return;
    a.el.classList.remove("shader-hidden");
    a.textHidden = false;
  }

  function hideText(a) {
    if (a.textHidden) return;
    a.el.style.fontSize = getComputedStyle(a.el).fontSize;
    a.el.classList.add("shader-hidden");
    a.textHidden = true;
  }

  function frame(now) {
    if (!active) return;
    var a = active;

    a.amt += (a.target - a.amt) * 0.07;
    a.opacity += (a.opacityTarget - a.opacity) * 0.1;

    // Once the DOM text is back, keep the overlay flat so compositing over
    // the real text stays pixel-stable (relief + text below reads as dark).
    if (!a.textHidden && a.opacityTarget === 0) {
      a.amt = 0;
    }

    // Fade in: flat ink over visible text, then swap and ramp relief.
    if (a.pendingEffect && a.opacity > 0.99) {
      a.pendingEffect = false;
      hideText(a);
      a.target = 1;
    }

    // Fade out: flatten relief, restore text, fade shader alpha over it.
    if (a.flattenFirst && a.amt < 0.005) {
      a.flattenFirst = false;
      a.amt = 0;
      showText(a);
      a.opacityTarget = 0;
    }

    if (
      a.target === 0 &&
      !a.flattenFirst &&
      a.opacityTarget === 0 &&
      a.amt < 0.005 &&
      a.opacity < 0.015 &&
      !a.textHidden
    ) {
      teardown();
      return;
    }

    // Mouse position in canvas UV space (the shader's gradient center).
    var r = a.rect;
    var mx = (pointer.x - (r.left - PAD)) / (r.width + PAD * 2);
    var my = 1 - (pointer.y - (r.top - PAD)) / (r.height + PAD * 2);

    gl.uniform1f(U.time, (now - a.start) / 1000);
    gl.uniform1f(U.amt, a.amt);
    gl.uniform1f(U.opacity, a.opacity);
    gl.uniform2f(U.mouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    a.raf = requestAnimationFrame(frame);
  }

  // Titles grow on hover (a CSS font-size transition), so wait for the
  // element's box to fully settle before we rasterize it. The tolerance is
  // tight — near the end of an ease the box moves fractions of a pixel per
  // frame, and capturing early makes the WebGL copy visibly smaller.
  function whenStable(el) {
    return new Promise(function (resolve) {
      var last = el.getBoundingClientRect();
      var calm = 0;
      function check() {
        var r = el.getBoundingClientRect();
        if (
          Math.abs(r.width - last.width) < 0.05 &&
          Math.abs(r.height - last.height) < 0.05 &&
          Math.abs(r.left - last.left) < 0.05 &&
          Math.abs(r.top - last.top) < 0.05
        ) {
          calm++;
          if (calm >= 5) return resolve(r);
        } else {
          calm = 0;
        }
        last = r;
        // setTimeout rather than requestAnimationFrame: rAF can be throttled
        // to a standstill in background/embedded tabs, which would leave the
        // hover permanently stalled here.
        setTimeout(check, 16);
      }
      check();
    });
  }

  function teardown() {
    if (!active) return;
    cancelAnimationFrame(active.raf);
    active.el.style.fontSize = "";
    showText(active);
    canvas.classList.remove("visible");
    active = null;
  }

  function activate(el) {
    whenStable(el).then(function (rect) {
      if (rect.width < 2 || rect.height < 2) return null;
      if (el.matches(":hover") === false) return null;
      return rasterize(el, rect).then(function (img) {
        return { img: img, rect: rect };
      });
    }).then(function (res) {
      if (!res) return;
      var img = res.img;
      var rect = res.rect;
      // The element may have been left before rasterization finished.
      if (el.matches(":hover") === false) return;
      if (active && active.el === el) return;
      teardown();

      var w = Math.ceil((rect.width + PAD * 2) * DPR);
      var h = Math.ceil((rect.height + PAD * 2) * DPR);

      texCanvas.width = w;
      texCanvas.height = h;
      texCtx.clearRect(0, 0, w, h);
      // Draw at the image's natural size — any fractional rescale here
      // resamples the glyphs and fattens their antialiased edges.
      texCtx.drawImage(img, Math.round(PAD * DPR), Math.round(PAD * DPR));

      // Snap the canvas to the device-pixel grid and size it to exactly
      // buffer/DPR CSS pixels — otherwise the compositor rescales the
      // buffer by a fraction of a percent, softening (and slightly
      // darkening) every glyph.
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = w / DPR + "px";
      canvas.style.height = h / DPR + "px";
      // The canvas is position:fixed, so these are viewport coordinates.
      canvas.style.left = Math.round((rect.left - PAD) * DPR) / DPR + "px";
      canvas.style.top = Math.round((rect.top - PAD) * DPR) / DPR + "px";

      gl.viewport(0, 0, w, h);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas
      );
      gl.uniform2f(U.res, w, h);

      // Draw the first frame (amt = 0 renders flat ink, identical to the
      // real text) BEFORE swapping visibility, so the canvas is never shown
      // empty and the text is never hidden early — no white blink.
      gl.uniform1f(U.time, 0);
      gl.uniform1f(U.amt, 0);
      gl.uniform1f(U.opacity, 0);
      gl.uniform2f(U.mouse, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      canvas.classList.add("visible");

      active = {
        el: el,
        rect: rect,
        amt: 0,
        target: 0,
        opacity: 0,
        opacityTarget: 1,
        pendingEffect: true,
        flattenFirst: false,
        textHidden: false,
        start: performance.now(),
        raf: 0,
      };
      active.raf = requestAnimationFrame(frame);
    }).catch(function () {
      /* rasterization can fail on odd content; the page just stays plain */
    });
  }

  document.addEventListener("mouseover", function (e) {
    var el = e.target.closest(SELECTOR);
    if (!el || el.dataset.noShader !== undefined) return;
    // Prefer block-level containers: if an inline link sits inside a matched
    // block, shade the whole block.
    var block = el.closest("p, li, h1, h2, h3");
    if (block) el = block;
    if (active && active.el === el) {
      active.target = 1;
      active.opacityTarget = 1;
      active.pendingEffect = false;
      active.flattenFirst = false;
      if (active.opacity > 0.99 && active.amt < 0.01) hideText(active);
      return;
    }
    activate(el);
  });

  document.addEventListener("mouseout", function (e) {
    if (!active) return;
    var to = e.relatedTarget;
    if (to && active.el.contains(to)) return;
    if (to && to.closest && to.closest(SELECTOR) === active.el) return;
    active.target = 0;
    active.pendingEffect = false;
    if (!active.textHidden) {
      active.flattenFirst = false;
      active.amt = 0;
      active.opacityTarget = 0;
    } else {
      active.flattenFirst = true;
    }
  });

  window.addEventListener("scroll", teardown, { passive: true });
  window.addEventListener("resize", teardown);
})();
