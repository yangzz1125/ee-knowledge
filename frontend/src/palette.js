// 星体颜色：六种知识类型，饱和但不刺眼，亮度接近，靠色相区分。
export const TYPE_COLORS = {
  concept: "#46d3e6",
  quantity: "#6f97ff",
  law: "#f4c14f",
  formula: "#b88aff",
  method: "#4fd49b",
  application: "#ff7aa6",
};

// 星云颜色：每章一团，按章节顺序取色，只用来铺底色和章节标签。
const NEBULA_COLORS = ["#3d6bff", "#8f5bff", "#1fc4b4", "#ff5c8a", "#ffaa3d", "#3fc8ff"];

export const nebulaColor = order => NEBULA_COLORS[(order - 1) % NEBULA_COLORS.length];

export const VALUE_KIND_LABELS = { scalar: "标量", vector: "矢量" };

/** 把 "#rrggbb" 向白色混合 amount（0–1），返回 "#rrggbb"。连线用它得到偏浅的类型色。 */
export function tint(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = channel => Math.round(channel + (255 - channel) * amount);
  const [r, g, b] = [value >> 16, (value >> 8) & 255, value & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** "#rrggbb" 转 "rgba(r, g, b, a)"。 */
export function withAlpha(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
