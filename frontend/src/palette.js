// 纸面配色：每章一个颜色，图谱节点、章节列表、详情卡、搜索结果都按章节取色。
// 六个颜色明度接近，在浅色底上都能看清，靠色相区分。
const CHAPTER_COLORS = ["#3b6fd8", "#2f9e6e", "#c4841a", "#8a5cd1", "#d14d6a", "#1f95b3"];

export const chapterColor = order => CHAPTER_COLORS[(order - 1) % CHAPTER_COLORS.length];

export const VALUE_KIND_LABELS = { scalar: "标量", vector: "矢量" };
