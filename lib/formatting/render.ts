import type { Mark, ParagraphFormat } from "@/lib/formatting/types";

// Cores do PDF ajustadas para ficarem legíveis no app: contraste de pelo menos 4,5:1 contra os fundos do tema claro
// (papel e cartão) e do escuro. A cor muda só o necessário (mesmo tom, mais escura ou mais clara).
const LIGHT_BACKGROUNDS = ["#ffffff", "#f7f6f1", "#efeee7"];
const DARK_BACKGROUNDS = ["#14201a", "#1b2a22", "#24362c"];
const MIN_CONTRAST = 4.5;

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
const linear = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
export function luminance(hex: string): number { const [r, g, b] = channels(hex).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string): number { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function toHex([h, s, l]: [number, number, number]): string {
  const hue = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  return `#${rgb.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function readableColor(hex: string, theme: "light" | "dark"): string {
  const backgrounds = theme === "light" ? LIGHT_BACKGROUNDS : DARK_BACKGROUNDS;
  const ok = (color: string) => backgrounds.every((background) => contrast(color, background) >= MIN_CONTRAST);
  if (ok(hex)) return hex;
  const [h, s, l] = toHsl(hex);
  for (let step = 1; step <= 100; step++) {
    const candidate = toHex([h, s, theme === "light" ? Math.max(0, l - step / 100) : Math.min(1, l + step / 100)]);
    if (ok(candidate)) return candidate;
  }
  return theme === "light" ? "#000000" : "#ffffff";
}

// Fundo de caixa: no claro, a cor do PDF quando já é clara (senão, um tom claro dela); no escuro, um tom escuro dela,
// com a borda na cor legível. O texto da caixa segue com a cor normal do tema.
export function boxColors(hex: string): { light: string; dark: string; border: string } {
  const [h, s] = toHsl(hex);
  return { light: luminance(hex) > 0.6 ? hex : toHex([h, Math.min(s, 0.6), 0.9]), dark: toHex([h, Math.min(s, 0.45), 0.17]), border: readableColor(toHex([h, s, 0.45]), "dark") };
}

export type Fmt = { style: string; color: string | null };
// Parte os trechos (já partidos pelos grifos) também nos limites das marcas de formatação. O texto não muda.
export function withMarks<T extends { text: string }>(segments: T[], marks: Mark[] | undefined): (T & { fmt: Fmt | null })[] {
  if (!marks?.length) return segments.map((segment) => ({ ...segment, fmt: null }));
  const out: (T & { fmt: Fmt | null })[] = [];
  let offset = 0;
  for (const segment of segments) {
    const end = offset + segment.text.length;
    const cuts = new Set([offset, end]);
    for (const [from, to] of marks) { if (from > offset && from < end) cuts.add(from); if (to > offset && to < end) cuts.add(to); }
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i], to = points[i + 1];
      const mark = marks.find(([start, stop]) => start <= from && stop >= to);
      out.push({ ...segment, text: segment.text.slice(from - offset, to - offset), fmt: mark ? { style: mark[2], color: mark[3] ?? null } : null });
    }
    offset = end;
  }
  return out;
}

// Classes e variáveis de estilo do parágrafo (recuo, marcador e caixa) e de um trecho (negrito, itálico, sublinhado, cor).
export function paragraphProps(format: ParagraphFormat | null | undefined): { className: string; style?: Record<string, string>; bullet?: string } {
  if (!format) return { className: "" };
  const classes = [format.indent ? `fx-indent-${Math.min(4, Math.max(1, format.indent))}` : "", format.box ? "fx-box" : "", format.bullet ? "fx-bullet" : ""].filter(Boolean);
  const style: Record<string, string> = {};
  if (format.box && /^#[0-9a-f]{6}$/i.test(format.box)) { const colors = boxColors(format.box.toLowerCase()); style["--bx-l"] = colors.light; style["--bx-d"] = colors.dark; style["--bx-b"] = colors.border; }
  return { className: classes.join(" "), style: Object.keys(style).length ? style : undefined, bullet: format.bullet === "check" ? "✔" : format.bullet === "dot" ? "•" : undefined };
}

export function spanProps(fmt: Fmt): { className: string; style?: Record<string, string> } {
  const color = fmt.color && /^#[0-9a-f]{6}$/i.test(fmt.color) ? fmt.color.toLowerCase() : null;
  const classes = ["fx", fmt.style.includes("b") ? "fx-b" : "", fmt.style.includes("i") ? "fx-i" : "", fmt.style.includes("u") ? "fx-u" : "", color ? "fx-c" : ""].filter(Boolean);
  return { className: classes.join(" "), style: color ? { "--fx-l": readableColor(color, "light"), "--fx-d": readableColor(color, "dark") } : undefined };
}
