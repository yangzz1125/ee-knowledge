import { tint, withAlpha } from "../palette.js";

const SIZE = 128;
const cache = new Map();

/**
 * 星体贴图：近白的星核，外面一圈类型色光晕；spikes 为 true 时加十字星芒（亮星）。
 * 3D 当作 Sprite 贴图，2D 直接 drawImage，两边看起来一致。同一组参数只画一次。
 */
export function starCanvas(color, spikes) {
  const key = `${color}|${spikes}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d");
  const middle = SIZE / 2;

  const halo = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
  halo.addColorStop(0, withAlpha(color, 0.55));
  halo.addColorStop(0.22, withAlpha(color, 0.22));
  halo.addColorStop(0.5, withAlpha(color, 0.06));
  halo.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = halo;
  context.fillRect(0, 0, SIZE, SIZE);

  if (spikes) {
    const spike = (angle, length, width) => {
      context.save();
      context.translate(middle, middle);
      context.rotate(angle);
      const gradient = context.createLinearGradient(-length, 0, length, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.5, "rgba(255,255,255,0.85)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(-length, 0);
      context.lineTo(0, -width);
      context.lineTo(length, 0);
      context.lineTo(0, width);
      context.closePath();
      context.fill();
      context.restore();
    };
    spike(0, middle * 0.95, 1.6);
    spike(Math.PI / 2, middle * 0.95, 1.6);
    spike(Math.PI / 4, middle * 0.42, 1);
    spike(-Math.PI / 4, middle * 0.42, 1);
  }

  const core = context.createRadialGradient(middle, middle, 0, middle, middle, SIZE * 0.13);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.45, tint(color, 0.55));
  core.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = core;
  context.beginPath();
  context.arc(middle, middle, SIZE * 0.13, 0, Math.PI * 2);
  context.fill();

  cache.set(key, canvas);
  return canvas;
}

/** 随机星空平铺图（data URL），2D 画布用作背景，代替规则排列的点阵。 */
export function starfieldTile(size = 900, count = 700) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  const colors = ["255,255,255", "190,205,255", "255,232,200"];
  for (let i = 0; i < count; i += 1) {
    // 大多数是暗淡的小点，少数是稍亮的星。
    const bright = Math.random() < 0.06;
    context.fillStyle = `rgba(${colors[i % colors.length]},${bright ? 0.9 : 0.2 + Math.random() * 0.4})`;
    context.beginPath();
    context.arc(Math.random() * size, Math.random() * size, bright ? 1.1 + Math.random() * 0.6 : 0.4 + Math.random() * 0.5, 0, Math.PI * 2);
    context.fill();
  }
  return canvas.toDataURL();
}

/** 贴图边长与星体半径之比：贴图中心的星核半径约占边长的 13%。 */
export const SPRITE_SCALE = 10;
