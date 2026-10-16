import * as THREE from 'three';
import type { MaterialType } from '../config';

// Procedural canvas textures: the prototype ships with no image assets.

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number, light: boolean): void {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function finish(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** One grass tile per 4 m grid cell, with a faint border so the build grid is readable. */
export function groundTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4f8a3a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const g = 110 + Math.random() * 60;
    ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.35},0.35)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 5);
  }
  speckle(ctx, size, 800, 0.12, false);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  return finish(c, true);
}

const cache = new Map<MaterialType, THREE.CanvasTexture>();

export function buildTexture(mat: MaterialType): THREE.CanvasTexture {
  const hit = cache.get(mat);
  if (hit) return hit;
  const size = 256;
  const [c, ctx] = canvas(size);
  if (mat === 'wood') {
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const shade = 150 + Math.random() * 40;
      ctx.fillStyle = `rgb(${shade + 40},${shade - 10},${shade - 70})`;
      ctx.fillRect(0, (p * size) / planks, size, size / planks);
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = `rgba(90,50,20,${0.15 + Math.random() * 0.2})`;
        ctx.beginPath();
        const y = (p * size) / planks + Math.random() * (size / planks);
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + 3, size * 0.6, y - 3, size, y + 1);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(60,30,10,0.8)';
      ctx.fillRect(0, (p * size) / planks, size, 3);
    }
    ctx.fillStyle = 'rgba(40,20,5,0.9)';
    for (const x of [14, size - 18]) {
      for (let p = 0; p < planks; p++) ctx.fillRect(x, (p * size) / planks + 26, 5, 5);
    }
  } else if (mat === 'brick') {
    ctx.fillStyle = '#8f8f8a';
    ctx.fillRect(0, 0, size, size);
    const rows = 8;
    const h = size / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? h : 0;
      for (let x = -off; x < size; x += h * 2) {
        const s = 140 + Math.random() * 50;
        ctx.fillStyle = `rgb(${s + 30},${s * 0.55},${s * 0.42})`;
        ctx.fillRect(x + 2, r * h + 2, h * 2 - 4, h - 4);
      }
    }
    speckle(ctx, size, 1500, 0.2, false);
  } else {
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    for (let i = 0; i <= 16; i++) grad.addColorStop(i / 16, i % 2 ? '#7d8994' : '#aab5bf');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(30,40,50,0.7)';
    ctx.fillRect(0, 0, size, 6);
    ctx.fillRect(0, size - 6, size, 6);
    ctx.fillStyle = 'rgba(30,30,30,0.8)';
    for (const x of [10, size / 2, size - 14]) for (const y of [14, size - 18]) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, size, 700, 0.15, true);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, size, size);
  const tex = finish(c);
  cache.set(mat, tex);
  return tex;
}

export function barkTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(40,25,10,${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * size, 0, 2 + Math.random() * 3, size);
  }
  return finish(c, true);
}
