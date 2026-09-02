import React, { useRef, useEffect } from 'react';

export default function FaultyTerminal({
  scale = 2.4,
  digitSize = 1.2,
  scanlineIntensity = 0.4,
  glitchAmount = 0.0,
  flickerAmount = 0.15,
  noiseAmp = 0.4,
  chromaticAberration = 0.04,
  dither = 0.15,
  curvature = 0.55,
  tint = '#f0905a',
  mouseReact = true,
  mouseStrength = 0.85,
  brightness = 0.6
}) {
  const canvasRef = useRef(null);

  const hexToRgb = (hex) => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return;

    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;

      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_scale;
      uniform float u_digit_size;
      uniform float u_scanline;
      uniform float u_flicker;
      uniform float u_noise;
      uniform float u_chroma;
      uniform float u_dither;
      uniform float u_curvature;
      uniform vec3 u_tint;
      uniform float u_mouse_strength;
      uniform float u_brightness;

      // Pseudo-random hash
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Smooth CRT Barrel Curvature
      vec2 curve(vec2 uv, float bend) {
        vec2 centered = uv * 2.0 - 1.0;
        vec2 offset = abs(centered.yx) / vec2(6.0, 4.0);
        centered += centered * offset * offset * (bend * 1.25);
        return centered * 0.5 + 0.5;
      }

      // Linear Fluid Ribbon Flow Field (Slower, Directional, Non-Circular)
      float flowField(vec2 p, float t, vec2 mouse) {
        // Fluid wave drag on mouse movement
        if (u_mouse_strength > 0.0) {
          vec2 mPos = (mouse * 2.0 - 1.0) * 1.8;
          vec2 delta = p - mPos;
          float mDist = length(delta);
          if (mDist < 1.8) {
            float force = smoothstep(1.8, 0.0, mDist);
            vec2 waveDrag = vec2(-delta.y, delta.x) * 0.4 + delta * 0.2;
            p += waveDrag * force * u_mouse_strength;
          }
        }

        // Diagonal wave projection (removes radial concentric circles)
        vec2 tp = vec2(p.x * 0.85 - p.y * 0.52, p.x * 0.52 + p.y * 0.85);

        // Gentle, slow harmonic waves
        vec2 q = vec2(
          sin(tp.x * 1.1 + t * 0.18 + sin(tp.y * 0.7 + t * 0.12)),
          cos(tp.y * 1.1 + t * 0.15 + cos(tp.x * 0.7 + t * 0.14))
        );

        vec2 r = vec2(
          sin(tp.x * 1.6 + q.y * 1.8 + t * 0.12 + 1.4),
          cos(tp.y * 1.6 + q.x * 1.8 + t * 0.14 + 3.8)
        );

        // Sweeping stream layers
        float w1 = sin(tp.y * 2.4 + r.x * 1.6 + t * 0.20);
        float w2 = cos(tp.x * 1.6 + r.y * 1.4 - t * 0.16);
        float w3 = sin((tp.x + tp.y) * 1.8 + q.x * 1.4 + t * 0.18);

        float val = w1 * 0.5 + w2 * 0.32 + w3 * 0.18;
        return val * 0.5 + 0.5;
      }

      // Crisp Halftone Glyphs (Reduces solid block patching)
      float renderGlyph(vec2 sub, float lum) {
        vec2 p = abs(sub - 0.5);
        float distManhattan = p.x + p.y;
        float distSquare = max(p.x, p.y);

        // Cell padding to prevent large solid orange blobs
        if (distSquare > 0.40) return 0.0;

        if (lum < 0.26) return 0.0; // Higher black background contrast
        if (lum < 0.50) return step(distManhattan, 0.14); // Fine dot
        if (lum < 0.75) return step(distManhattan, 0.28); // Diamond
        if (lum < 0.90) return step(distSquare, 0.32) * (1.0 - step(distManhattan, 0.10)); // Open frame
        return step(distSquare, 0.36); // Inset solid matrix
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv.y = 1.0 - uv.y;

        // 1. CRT Fisheye Curvature
        if (u_curvature > 0.0) {
          uv = curve(uv, u_curvature);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
        }

        // 2. Aspect Ratio & Character Matrix Grid
        float aspect = u_resolution.x / u_resolution.y;
        vec2 gridUv = vec2(uv.x * aspect, uv.y);
        vec2 grid = gridUv * (46.0 * (u_scale / u_digit_size));
        vec2 cellIndex = floor(grid);
        vec2 cellSub = fract(grid);

        // 3. Sample Flow Field
        vec2 p = (cellIndex / (46.0 * (u_scale / u_digit_size))) * 3.2 - 1.6;
        float baseLum = flowField(p, u_time, u_mouse);

        // Slender Topographic Ribbon Waves (Crisp crests with ample dark space)
        float bands = sin(baseLum * 14.0 + u_time * 0.18);
        float lum = smoothstep(0.22, 0.88, bands);

        // 4. Scanlines
        float scanline = sin(gl_FragCoord.y * 1.8) * 0.5 + 0.5;
        scanline = mix(1.0, pow(scanline, 1.3), u_scanline);

        // 5. Subtle CRT Flicker
        float flicker = 1.0;
        if (u_flicker > 0.0) {
          flicker -= hash(vec2(floor(u_time * 20.0), 0.0)) * 0.04 * u_flicker;
        }

        // 6. Dither & Texture
        float n = (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * u_noise * 0.03;
        float ditherLum = clamp(lum + (hash(cellIndex) - 0.5) * u_dither * 0.15 + n, 0.0, 1.0);

        // 7. Chromatic Aberration & Soft Tinting
        vec3 color;
        if (u_chroma > 0.0) {
          float shift = u_chroma * 0.03;
          float rLum = flowField(p + vec2(shift, 0.0), u_time, u_mouse);
          float bLum = flowField(p - vec2(shift, 0.0), u_time, u_mouse);

          float rBands = smoothstep(0.22, 0.88, sin(rLum * 14.0 + u_time * 0.18));
          float bBands = smoothstep(0.22, 0.88, sin(bLum * 14.0 + u_time * 0.18));

          float rGlyph = renderGlyph(cellSub, rBands);
          float gGlyph = renderGlyph(cellSub, ditherLum);
          float bGlyph = renderGlyph(cellSub, bBands);

          color = vec3(
            u_tint.r * rGlyph * 1.1,
            u_tint.g * gGlyph * 1.1,
            u_tint.b * bGlyph * 1.1
          ) * scanline * flicker * u_brightness;
        } else {
          float charMask = renderGlyph(cellSub, ditherLum);
          color = u_tint * (charMask * 1.1) * scanline * flicker * u_brightness;
        }

        // 8. Vignette
        float vig = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
        vig = clamp(pow(16.0 * vig, 0.4), 0.0, 1.0);
        color *= vig;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('GL Link error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uTimeLoc = gl.getUniformLocation(program, 'u_time');
    const uResLoc = gl.getUniformLocation(program, 'u_resolution');
    const uMouseLoc = gl.getUniformLocation(program, 'u_mouse');
    const uScaleLoc = gl.getUniformLocation(program, 'u_scale');
    const uDigitSizeLoc = gl.getUniformLocation(program, 'u_digit_size');
    const uScanlineLoc = gl.getUniformLocation(program, 'u_scanline');
    const uFlickerLoc = gl.getUniformLocation(program, 'u_flicker');
    const uNoiseLoc = gl.getUniformLocation(program, 'u_noise');
    const uChromaLoc = gl.getUniformLocation(program, 'u_chroma');
    const uDitherLoc = gl.getUniformLocation(program, 'u_dither');
    const uCurvatureLoc = gl.getUniformLocation(program, 'u_curvature');
    const uTintLoc = gl.getUniformLocation(program, 'u_tint');
    const uMouseStrengthLoc = gl.getUniformLocation(program, 'u_mouse_strength');
    const uBrightnessLoc = gl.getUniformLocation(program, 'u_brightness');

    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let smoothMouseX = 0.5;
    let smoothMouseY = 0.5;

    const handleMouseMove = (e) => {
      if (!mouseReact) return;
      const rect = canvas.getBoundingClientRect();
      targetMouseX = (e.clientX - rect.left) / rect.width;
      targetMouseY = 1.0 - (e.clientY - rect.top) / rect.height;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener('resize', resize);
    resize();

    let animationFrameId;
    const startTime = performance.now();

    const render = () => {
      const currentTime = (performance.now() - startTime) * 0.001;

      // Smooth liquid mouse interpolation
      smoothMouseX += (targetMouseX - smoothMouseX) * 0.05;
      smoothMouseY += (targetMouseY - smoothMouseY) * 0.05;

      gl.uniform1f(uTimeLoc, currentTime);
      gl.uniform2f(uResLoc, canvas.width, canvas.height);
      gl.uniform2f(uMouseLoc, smoothMouseX, smoothMouseY);
      gl.uniform1f(uScaleLoc, scale);
      gl.uniform1f(uDigitSizeLoc, digitSize);
      gl.uniform1f(uScanlineLoc, scanlineIntensity);
      gl.uniform1f(uFlickerLoc, flickerAmount);
      gl.uniform1f(uNoiseLoc, noiseAmp);
      gl.uniform1f(uChromaLoc, chromaticAberration);
      gl.uniform1f(uDitherLoc, dither);
      gl.uniform1f(uCurvatureLoc, curvature);
      gl.uniform3fv(uTintLoc, hexToRgb(tint));
      gl.uniform1f(uMouseStrengthLoc, mouseReact ? mouseStrength : 0.0);
      gl.uniform1f(uBrightnessLoc, brightness);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', resize);
    };
  }, [
    scale,
    digitSize,
    scanlineIntensity,
    flickerAmount,
    noiseAmp,
    chromaticAberration,
    dither,
    curvature,
    tint,
    mouseReact,
    mouseStrength,
    brightness
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block bg-black"
      style={{ width: '100%', height: '100%' }}
    />
  );
}