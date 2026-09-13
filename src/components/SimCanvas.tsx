"use client";

import { useEffect, useRef } from "react";

export interface CanvasHazard {
  pos: [number, number];
  radius: number;
}

export interface CanvasTrajPoint {
  pos: [number, number];
  heading: number;
  overridden: boolean;
}

interface Props {
  hazards: CanvasHazard[];
  goal: [number, number];
  trajectory: CanvasTrajPoint[];
  frame: number;
  accentLabel: string;
  accentColor: string;
}

const WORLD_HALF = 1.9;

export default function SimCanvas({ hazards, goal, trajectory, frame, accentLabel, accentColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const toPx = (p: [number, number]): [number, number] => [
      ((p[0] + WORLD_HALF) / (2 * WORLD_HALF)) * size,
      ((-p[1] + WORLD_HALF) / (2 * WORLD_HALF)) * size,
    ];
    const scalePx = (r: number) => (r / (2 * WORLD_HALF)) * size;

    ctx.clearRect(0, 0, size, size);

    // background grid
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const gridStep = size / 12;
    for (let i = 0; i <= 12; i++) {
      ctx.beginPath();
      ctx.moveTo(i * gridStep, 0);
      ctx.lineTo(i * gridStep, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * gridStep);
      ctx.lineTo(size, i * gridStep);
      ctx.stroke();
    }

    // hazards
    for (const h of hazards) {
      const [hx, hy] = toPx(h.pos);
      const hr = scalePx(h.radius);
      const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 1.8);
      grad.addColorStop(0, "rgba(239,68,68,0.35)");
      grad.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hx, hy, hr * 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(239,68,68,0.55)";
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // goal
    {
      const [gx, gy] = toPx(goal);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(gx, gy, scalePx(0.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#22c55e";
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // trajectory up to current frame
    const upto = trajectory.slice(0, Math.max(1, frame + 1));
    for (let i = 1; i < upto.length; i++) {
      const [x1, y1] = toPx(upto[i - 1].pos);
      const [x2, y2] = toPx(upto[i].pos);
      ctx.strokeStyle = upto[i].overridden ? "#f59e0b" : accentColor;
      ctx.lineWidth = upto[i].overridden ? 3 : 2;
      ctx.globalAlpha = 0.35 + 0.65 * (i / upto.length);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // robot marker
    if (upto.length > 0) {
      const cur = upto[upto.length - 1];
      const [rx, ry] = toPx(cur.pos);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(-cur.heading);
      ctx.fillStyle = cur.overridden ? "#f59e0b" : "#e5e7eb";
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // label
    ctx.fillStyle = "rgba(229,231,235,0.7)";
    ctx.font = "12px var(--font-geist-mono), monospace";
    ctx.fillText(accentLabel, 10, 18);
  }, [hazards, goal, trajectory, frame, accentLabel, accentColor]);

  return (
    <canvas
      ref={canvasRef}
      className="aspect-square w-full rounded-lg border border-white/10"
      style={{ display: "block" }}
    />
  );
}
