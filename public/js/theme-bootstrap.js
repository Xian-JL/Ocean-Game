"use strict";

/*
 * Ocean-v1.3.2 · 主题首帧引导（theme bootstrap）
 * 在 CSS 加载后、其余脚本执行前同步应用已保存的主题与强调色，
 * 避免刷新时出现主题闪烁。脚本本身不创建 UI，也不影响对局逻辑。
 * 存储键与 app.js 保持一致：ocean.theme.v1 / ocean.accent.v1。
 */
(function applyStoredPersonalization(root) {
  const THEME_KEY = "ocean.theme.v1";
  const ACCENT_KEY = "ocean.accent.v1";
  const THEMES = ["ocean-dark", "ocean-light", "ocean-dusk"];
  const ACCENTS = Object.freeze({
    cyan: ["#63ddf5", "#1ec6eb", "rgba(64, 204, 236, 0.12)", "99, 221, 245"],
    gold: ["#f4c25a", "#d9a02e", "rgba(244, 194, 90, 0.14)", "244, 194, 90"],
    jade: ["#59e0ac", "#2fbf85", "rgba(89, 224, 172, 0.14)", "89, 224, 172"],
    crimson: ["#ff6b77", "#e23b4c", "rgba(255, 107, 119, 0.14)", "255, 107, 119"],
    violet: ["#bc8cff", "#9660e8", "rgba(188, 140, 255, 0.14)", "188, 140, 255"],
  });

  let theme = "ocean-dark";
  let accent = "cyan";
  try {
    const storedTheme = root.localStorage?.getItem(THEME_KEY);
    if (THEMES.includes(storedTheme)) theme = storedTheme;
    const storedAccent = root.localStorage?.getItem(ACCENT_KEY);
    if (Object.hasOwn(ACCENTS, storedAccent)) accent = storedAccent;
  } catch (_error) {
    // 存储不可用时保持默认值。
  }

  const documentRoot = root.document?.documentElement;
  if (!documentRoot) return;
  documentRoot.dataset.theme = theme;
  const style = documentRoot.style;
  const parts = ACCENTS[accent];
  style.setProperty("--accent-primary", parts[0]);
  style.setProperty("--accent-strong", parts[1]);
  style.setProperty("--accent-soft", parts[2]);
  style.setProperty("--accent-primary-rgb", parts[3]);
})(typeof globalThis === "object" ? globalThis : window);
