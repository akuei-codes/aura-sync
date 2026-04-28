import { useEffect, useRef } from "react";

type Props = {
  className?: string;
  // 0..1 baseline energy; the engine modulates around this with synthetic bass/beat.
  energy?: number;
  bpm?: number;
  // "auto" switches mode based on energy; otherwise locks to one mode.
  mode?: "auto" | "abstract" | "silhouette";
};

/**
 * ZYNK Projection Engine
 * - Pure black & white. High contrast. Cinematic.
 * - Synthesizes a beat envelope from BPM (no real audio in prototype).
 * - Two visual modes:
 *    abstract:   ink-fluid metaball shadows + particle field
 *    silhouette: choreographed dancer figures
 * - "auto" switches: energy < 0.55 => abstract; >= 0.55 => silhouette
 */
export function ProjectionEngine({ className = "", energy = 0.65, bpm = 124, mode = "auto" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Persistent state
    const particles = Array.from({ length: 90 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006,
      vy: (Math.random() - 0.5) * 0.0006,
      r: 0.6 + Math.random() * 2.4,
    }));

    const blobs = Array.from({ length: 7 }).map((_, i) => ({
      seed: i * 13.37,
      baseR: 0.18 + Math.random() * 0.18,
    }));

    // Dancer figures — simple parametric skeletons
    const dancers = Array.from({ length: 6 }).map((_, i) => ({
      x: 0.12 + i * 0.16,
      phase: i * 0.7,
      scale: 0.7 + (i % 3) * 0.15,
    }));

    const beatPeriod = 60 / bpm; // seconds

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = (performance.now() - startRef.current) / 1000;

      // Beat envelope: sharp attack on the beat, exponential decay.
      const beatPhase = (t % beatPeriod) / beatPeriod;
      const beat = Math.pow(1 - beatPhase, 6);
      // Slow musical macro envelope
      const macro = 0.5 + 0.5 * Math.sin(t * 0.18);
      const eNow = Math.max(0, Math.min(1, energy * (0.7 + 0.3 * macro) + beat * 0.25));

      const useSilhouette = mode === "silhouette" || (mode === "auto" && eNow >= 0.55);

      // Background — deep vignette with breathing brightness
      const cx = w / 2, cy = h / 2;
      const grad = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.05, cx, cy, Math.max(w, h) * 0.75);
      const centerL = 12 + beat * 30 + eNow * 18;
      grad.addColorStop(0, `rgb(${centerL},${centerL},${centerL})`);
      grad.addColorStop(1, "rgb(0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle scanline / film grain
      ctx.globalAlpha = 0.06;
      for (let y = 0; y < h; y += 3) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1;

      if (!useSilhouette) {
        // === ABSTRACT MODE: ink metaballs ===
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const b of blobs) {
          const bx = w * (0.5 + 0.32 * Math.sin(t * 0.4 + b.seed));
          const by = h * (0.5 + 0.28 * Math.cos(t * 0.33 + b.seed * 1.3));
          const r = Math.min(w, h) * b.baseR * (0.85 + beat * 0.5 + eNow * 0.35);
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
          const a = 0.55 + beat * 0.35;
          g.addColorStop(0, `rgba(255,255,255,${a})`);
          g.addColorStop(0.55, `rgba(180,180,180,${a * 0.35})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Threshold pass: hard black / white poster effect on a copy region
        // Cheaper alternative: overlay a high-contrast veil that follows energy.
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = `rgba(0,0,0,${0.35 - eNow * 0.25})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        // Particle dust
        ctx.fillStyle = `rgba(255,255,255,${0.5 + beat * 0.4})`;
        for (const p of particles) {
          p.x += p.vx + Math.sin(t * 0.5 + p.y * 10) * 0.0004;
          p.y += p.vy + Math.cos(t * 0.4 + p.x * 10) * 0.0004;
          if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;
          if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
          const r = p.r * (0.8 + beat * 0.6);
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Geometric shadow bar that pulses on the beat
        const barH = h * (0.04 + beat * 0.06);
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(0, h * 0.5 - barH / 2, w * (0.2 + beat * 0.8), barH);
      } else {
        // === SILHOUETTE MODE: dancers ===
        // Background floor light
        const floor = ctx.createLinearGradient(0, h * 0.5, 0, h);
        floor.addColorStop(0, "rgba(255,255,255,0.0)");
        floor.addColorStop(1, `rgba(255,255,255,${0.08 + beat * 0.1})`);
        ctx.fillStyle = floor;
        ctx.fillRect(0, h * 0.5, w, h * 0.5);

        // Beat strobe flash — rare, only on hard beat
        if (beat > 0.85 && eNow > 0.7) {
          ctx.fillStyle = `rgba(255,255,255,${(beat - 0.85) * 1.2})`;
          ctx.fillRect(0, 0, w, h);
        }

        // Dancers
        for (const d of dancers) {
          const baseX = w * d.x;
          const baseY = h * 0.82;
          const bob = Math.sin(t * (Math.PI * 2) / beatPeriod + d.phase) * (10 + beat * 24);
          const sway = Math.sin(t * 1.2 + d.phase) * (12 + eNow * 18);
          const armSwing = Math.sin(t * (Math.PI * 2) / beatPeriod + d.phase) * (0.8 + beat);
          const legSwing = Math.cos(t * (Math.PI * 2) / beatPeriod + d.phase) * (0.6 + beat * 0.8);
          drawDancer(ctx, baseX + sway, baseY + bob, d.scale * (0.9 + beat * 0.12), armSwing, legSwing);
        }

        // Foreground vignette
        const v = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.2, cx, cy, Math.max(w, h) * 0.7);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
      }

      // Mode label tick (very subtle)
      // (kept off — projection should be pure visuals)

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [energy, bpm, mode]);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />;
}

function drawDancer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  armSwing: number,
  legSwing: number,
) {
  const u = 80 * s; // unit
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = u * 0.18;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Hard silhouette via thick strokes + filled shapes.
  // Body
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -u * 1.3);
  ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(0, -u * 1.55, u * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Arms
  const aL = -u * 1.15;
  ctx.beginPath();
  ctx.moveTo(0, aL);
  ctx.lineTo(Math.cos(armSwing) * u * 0.95, aL + Math.sin(armSwing) * u * 0.95 - u * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, aL);
  ctx.lineTo(-Math.cos(-armSwing) * u * 0.95, aL + Math.sin(-armSwing) * u * 0.95 - u * 0.1);
  ctx.stroke();

  // Legs
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(legSwing) * u * 0.55, u * 0.95);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-Math.sin(legSwing) * u * 0.55, u * 0.95);
  ctx.stroke();

  ctx.restore();
}
