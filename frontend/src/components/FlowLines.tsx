import { useEffect, useRef } from "react";

const LINE_COUNT = 13;
const START_X = -180;
const END_X = 1620;
const STEP_X = 36;

// Smooth value noise gives each pass a slightly different curve without frame-to-frame jitter.
function hash(x: number, y: number) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
  const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

function linePath(index: number, time: number) {
  const offset = (index - (LINE_COUNT - 1) / 2) * 17;
  const points: { x: number; y: number }[] = [];

  for (let x = START_X; x <= END_X; x += STEP_X) {
    const broadCurve = 380 - 160 * Math.sin(((x - 175) * Math.PI * 2) / 1310);
    const travellingWave = 27 * Math.sin(x * 0.009 - time * 0.85);
    const smallerWave = 9 * Math.sin(x * 0.018 + time * 0.48 + index * 0.07);
    const sharedVariation = (noise(x / 245, time * 0.17 + 11) - 0.5) * 22;
    const lineVariation = (noise(x / 150 + index * 0.21, time * 0.21 + index * 3) - 0.5) * 5;
    const y = broadCurve + offset + travellingWave + smallerWave + sharedVariation + lineVariation;
    points.push({ x, y });
  }

  const commands = [`M ${points[0].x} ${points[0].y.toFixed(2)}`];
  for (let index = 0; index < points.length - 1; index++) {
    const before = points[Math.max(0, index - 1)];
    const start = points[index];
    const end = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const control1Y = start.y + (end.y - before.y) / 6;
    const control2Y = end.y - (after.y - start.y) / 6;
    commands.push(`C ${(start.x + STEP_X / 3).toFixed(2)} ${control1Y.toFixed(2)} ${(end.x - STEP_X / 3).toFixed(2)} ${control2Y.toFixed(2)} ${end.x} ${end.y.toFixed(2)}`);
  }

  return commands.join(" ");
}

export default function FlowLines({ theme }: { theme: "light" | "dark" }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const paths = svgRef.current?.querySelectorAll("path");
    if (!paths) return;

    let frame = 0;
    let lastDraw = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      if (now - lastDraw < 32) return;
      lastDraw = now;
      const time = now / 1000;
      paths.forEach((path, index) => path.setAttribute("d", linePath(index, time)));
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg ref={svgRef} className="landing-flow-lines" viewBox="0 0 1440 720" preserveAspectRatio="xMidYMid slice" fill="none" stroke={theme === "light" ? "url(#light-ribbon-lines)" : "currentColor"} strokeWidth="1.15" aria-hidden="true">
      <defs><linearGradient id="light-ribbon-lines" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#2FD3F2" /><stop offset="1" stopColor="#7B61FF" /></linearGradient></defs>
      {Array.from({ length: LINE_COUNT }, (_, index) => <path key={index} d={linePath(index, 0)} />)}
    </svg>
  );
}
