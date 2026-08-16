import fs from "node:fs";
import path from "node:path";

const repository = "vanga999/ronin";
const dataPath = path.resolve("docs/data/stars.json");
const svgPath = path.resolve("docs/assets/stars.svg");
const [date, starsValue] = process.argv.slice(2);

if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
  throw new Error("Usage: node scripts/update-star-history.mjs YYYY-MM-DD STAR_COUNT");
}

const stars = Number(starsValue);
if (!Number.isInteger(stars) || stars < 0) {
  throw new Error("STAR_COUNT must be a non-negative integer");
}

const existing = fs.existsSync(dataPath)
  ? JSON.parse(fs.readFileSync(dataPath, "utf8"))
  : { repository, points: [] };
const points = Array.isArray(existing.points) ? existing.points : [];
const nextPoints = points.filter((point) => point.date !== date);
nextPoints.push({ date, stars });
nextPoints.sort((a, b) => a.date.localeCompare(b.date));

const data = { repository, points: nextPoints };
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
fs.writeFileSync(svgPath, renderSvg(data));

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderSvg({ repository: repo, points: series }) {
  const width = 960;
  const height = 360;
  const left = 74;
  const right = 32;
  const top = 74;
  const bottom = 64;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = series.map((point) => point.stars);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const range = Math.max(maxValue - minValue, 1);
  const yMin = Math.max(0, minValue - Math.max(1, Math.ceil(range * 0.15)));
  const yMax = maxValue + Math.max(1, Math.ceil(range * 0.15));
  const yRange = Math.max(yMax - yMin, 1);
  const x = (index) => left + (series.length === 1 ? chartWidth / 2 : (index / (series.length - 1)) * chartWidth);
  const y = (value) => top + chartHeight - ((value - yMin) / yRange) * chartHeight;
  const pointsAttribute = series.map((point, index) => `${x(index).toFixed(1)},${y(point.stars).toFixed(1)}`).join(" ");
  const last = series.at(-1);
  const first = series[0];
  const delta = last.stars - first.stars;
  const latestLabel = `${last.stars} star${last.stars === 1 ? "" : "s"}`;
  const ticks = [yMax, yMin + yRange / 2, yMin];
  const tickMarkup = ticks.map((value) => `
    <line x1="${left}" y1="${y(value).toFixed(1)}" x2="${width - right}" y2="${y(value).toFixed(1)}" class="grid" />
    <text x="${left - 14}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end" class="axis">${Math.round(value)}</text>`).join("").trim();
  const circles = series.map((point, index) => `
    <circle cx="${x(index).toFixed(1)}" cy="${y(point.stars).toFixed(1)}" r="${series.length > 40 ? 2.5 : 4}" class="point">
      <title>${escapeXml(point.date)} · ${point.stars} star${point.stars === 1 ? "" : "s"}</title>
    </circle>`).join("").trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">GitHub Star History for ${escapeXml(repo)}</title>
  <desc id="description">${escapeXml(series.length)} daily data point${series.length === 1 ? "" : "s"}; latest total is ${escapeXml(latestLabel)}.</desc>
  <style>
    .background { fill: #fbfaf5; }
    .title { fill: #16261f; font: 600 21px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle { fill: #65736c; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .axis { fill: #65736c; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .grid { stroke: #dce2dc; stroke-width: 1; stroke-dasharray: 4 5; }
    .line { fill: none; stroke: #f35d34; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .point { fill: #f35d34; stroke: #fbfaf5; stroke-width: 2; }
    .date { fill: #65736c; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .latest { fill: #176f51; font: 700 18px ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
  <rect width="${width}" height="${height}" rx="8" class="background" />
  <text x="${left}" y="34" class="title">GitHub Star History</text>
  <text x="${left}" y="53" class="subtitle">${escapeXml(repo)} · updated daily</text>
  <text x="${width - right}" y="40" text-anchor="end" class="latest">${latestLabel}${delta === 0 ? "" : ` · ${delta > 0 ? "+" : ""}${delta}`}</text>
  ${tickMarkup}
  <polyline points="${pointsAttribute}" class="line" />
  ${circles}
  <text x="${left}" y="${height - 22}" class="date">${escapeXml(first.date)}</text>
  <text x="${width - right}" y="${height - 22}" text-anchor="end" class="date">${escapeXml(last.date)}</text>
</svg>
`;
}
