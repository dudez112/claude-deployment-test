"use client";

import { useEffect, useRef } from "react";
import type { ModelConfig, ModelMetrics, Thresholds } from "@/lib/types";

interface Props {
  models: ModelConfig[];
  metrics: Record<string, ModelMetrics>;
  thresholds: Thresholds;
  paused: boolean;
  demand: number;
}

interface Particle {
  target: number;
  progress: number;
  speed: number;
  failed: boolean;
}

const COLORS = {
  line: "#2c3279",
  ink: "#eceeff",
  mute: "#a2a6dc",
  faint: "#6d72b4",
  signal: "#3ee0c5",
  plasma: "#a084ff",
  amber: "#ffc857",
  coral: "#ff6b8b",
};

function healthColor(m: ModelConfig, mm: ModelMetrics | undefined, t: Thresholds) {
  if (!m.online || !mm || mm.rps === 0) return COLORS.faint;
  if (mm.p95 > t.p95Ms * 1.5 || mm.errorRate * 100 > t.errorPct * 3) return COLORS.coral;
  if (mm.p95 > t.p95Ms || mm.errorRate * 100 > t.errorPct) return COLORS.amber;
  return COLORS.signal;
}

/**
 * The fleet as a live network: requests leave the router at the centre and
 * travel to each model at a rate proportional to its real share of traffic.
 * Failed requests are drawn in coral.
 */
export function MeshCanvas({ models, metrics, thresholds, paused, demand }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ models, metrics, thresholds, paused, demand });

  useEffect(() => {
    live.current = { models, metrics, thresholds, paused, demand };
  }, [models, metrics, thresholds, paused, demand]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = performance.now();
    const particles: Particle[] = [];
    const spawnBudget = new Map<number, number>();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const orbitRadius = () => Math.max(40, Math.min(height * 0.36, width / 2 - 80));
    const fontFamily = getComputedStyle(canvas).fontFamily || "system-ui, sans-serif";

    const layout = (count: number) => {
      const cx = width / 2;
      const cy = height / 2;
      const r = orbitRadius();
      return Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, angle };
      });
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { models: ms, metrics: mx, thresholds: th, paused: isPaused, demand: dem } = live.current;
      const cx = width / 2;
      const cy = height / 2;
      const nodes = layout(ms.length);
      const animate = !reduceMotion.matches && !isPaused;

      ctx.clearRect(0, 0, width, height);

      // Orbit guide.
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, orbitRadius(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Links.
      ms.forEach((m, i) => {
        const mm = mx[m.id];
        const active = m.online && mm && mm.rps > 0;
        ctx.strokeStyle = active ? `${healthColor(m, mm, th)}55` : `${COLORS.faint}33`;
        ctx.lineWidth = active ? 1 + Math.min(4, (mm.rps / 40) * 1.5) : 1;
        if (!m.online) ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nodes[i].x, nodes[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Spawn particles proportional to each model's live request rate.
      if (animate) {
        ms.forEach((m, i) => {
          const mm = mx[m.id];
          if (!m.online || !mm || mm.rps <= 0) return;
          const budget = (spawnBudget.get(i) ?? 0) + mm.rps * dt * 0.35;
          const whole = Math.floor(budget);
          spawnBudget.set(i, budget - whole);
          for (let k = 0; k < whole && particles.length < 600; k++) {
            particles.push({
              target: i,
              progress: 0,
              speed: 0.35 + Math.random() * 0.35,
              failed: Math.random() < mm.errorRate,
            });
          }
        });
        if (ms.every((m) => !m.online || m.weight === 0) && dem > 0) {
          // Rejected traffic: sparks that die at the router.
          for (let k = 0; k < Math.floor(dem * dt * 0.1); k++) {
            particles.push({ target: -1, progress: 0, speed: 1.2, failed: true });
          }
        }
      }

      for (let p = particles.length - 1; p >= 0; p--) {
        const part = particles[p];
        if (animate) part.progress += part.speed * dt;
        const node = nodes[part.target];
        if (part.progress >= 1 || (part.target >= 0 && !node)) {
          particles.splice(p, 1);
          continue;
        }
        let x: number;
        let y: number;
        if (part.target < 0) {
          const a = (p * 2.399) % (Math.PI * 2);
          x = cx + Math.cos(a) * part.progress * 26;
          y = cy + Math.sin(a) * part.progress * 26;
        } else {
          x = cx + (node.x - cx) * part.progress;
          y = cy + (node.y - cy) * part.progress;
        }
        ctx.fillStyle = part.failed ? COLORS.coral : COLORS.ink;
        ctx.globalAlpha = part.failed ? 0.95 : 0.35 + part.progress * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, part.failed ? 2 : 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Router.
      const routerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
      routerGlow.addColorStop(0, `${COLORS.plasma}cc`);
      routerGlow.addColorStop(1, `${COLORS.plasma}00`);
      ctx.fillStyle = routerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.plasma;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();

      // Model nodes and labels.
      const small = width < 420;
      ctx.font = `${small ? 10 : 11}px ${fontFamily}`;
      ms.forEach((m, i) => {
        const mm = mx[m.id];
        const { x, y, angle } = nodes[i];
        const color = healthColor(m, mm, th);
        const load = mm?.load ?? 0;
        const r = 6 + Math.min(1.4, load) * 6;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = m.online ? `${color}33` : "transparent";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Load arc around the node.
        if (m.online && load > 0) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.min(1, load) * Math.PI * 2);
          ctx.stroke();
        }

        const right = Math.cos(angle) >= -0.01;
        // On narrow canvases there's no room beside a node, so every label goes above or below it.
        const narrow = width < 480;
        const below = narrow ? Math.sin(angle) >= -0.5 : Math.sin(angle) > 0.5;
        const above = narrow ? !below : Math.sin(angle) < -0.5;
        ctx.textAlign = above || below ? "center" : right ? "left" : "right";
        const detail = m.online ? `${Math.round(mm?.rps ?? 0)} req/s, ${mm?.p95 ?? 0} ms` : "offline";
        const textW = Math.max(ctx.measureText(m.name).width, ctx.measureText(detail).width);
        let lx = above || below ? x : x + (right ? r + 10 : -(r + 10));
        // Keep labels inside the canvas on narrow screens.
        if (ctx.textAlign === "left") lx = Math.min(lx, width - textW - 6);
        else if (ctx.textAlign === "right") lx = Math.max(lx, textW + 6);
        else lx = Math.min(Math.max(lx, textW / 2 + 6), width - textW / 2 - 6);
        const ly = above ? y - r - 22 : below ? y + r + 18 : y - 4;
        ctx.fillStyle = m.online ? COLORS.ink : COLORS.faint;
        ctx.fillText(m.name, lx, ly);
        ctx.fillStyle = COLORS.mute;
        ctx.fillText(detail, lx, ly + 14);
      });

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const online = models.filter((m) => m.online).length;
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Live traffic map: ${online} of ${models.length} models online, routing ${Math.round(demand)} requests per second.`}
      className="h-full w-full"
    />
  );
}
