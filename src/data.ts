export const labels = [
  "不明",
  "1",
  "2",
  "3",
  "4",
  "5弱",
  "5",
  "5強",
  "6弱",
  "6",
  "6強",
  "7",
];
export const colors = [
  "#738185",
  "#597782",
  "#3a8076",
  "#32769c",
  "#bb8115",
  "#d97433",
  "#c66a38",
  "#bf572e",
  "#b23c3f",
  "#a43d57",
  "#8d385d",
  "#62377c",
];
export type EventRow = {
  id: string;
  at: string;
  name: string;
  depth: number | null;
  m: number | null;
  lat: number | null;
  lon: number | null;
  s: number;
  local: Record<string, number>;
  block: string;
};
export type Index = {
  months: string[];
  counts: string[];
  years: number[];
  updated?: string;
  bridgeFrom?: string;
  cutover?: string;
  gaps?: [string, string][];
};
export type Histogram = Record<string, Record<string, number>>;
export const day = (date: Date) =>
  new Date(+date + 9 * 3600000).toISOString().slice(0, 10);
export const shift = (s: string, n: number) =>
  new Date(Date.parse(s + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function covered(index: Index, d: string) {
  if (index.gaps?.some(([a, b]) => a <= d && d <= b)) return false;
  return (
    index.years.includes(Number(d.slice(0, 4))) ||
    Boolean(
      index.updated &&
        (index.bridgeFrom || index.cutover || "9999") <= d &&
        d <= index.updated.slice(0, 10),
    )
  );
}
const cache = new Map<string, Promise<unknown>>();
export async function get<T>(path: string, stamp = ""): Promise<T> {
  const key = path + "?v=" + encodeURIComponent(stamp);
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        const response = await fetch("./" + key, {
          cache: path.endsWith("index.json") ? "no-store" : "default",
        });
        if (!response.ok) throw new Error("データを取得できませんでした");
        if (path.endsWith(".gz")) {
          const bytes = await response.arrayBuffer();
          if (new Uint8Array(bytes)[0] === 31)
            return new Response(
              new Blob([bytes])
                .stream()
                .pipeThrough(new DecompressionStream("gzip")),
            ).json();
          return JSON.parse(new TextDecoder().decode(bytes));
        }
        return response.json();
      })().catch((error) => {
        cache.delete(key);
        throw error;
      }),
    );
  const result = (await cache.get(key)) as T;
  if (path.endsWith("index.json")) cache.delete(key);
  return result;
}
export function intensity(r: EventRow, city: string) {
  return city === "all" ? r.s : r.local[city] || 0;
}
