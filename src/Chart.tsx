import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import { BarChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { colors, labels } from "./data";
use([
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer,
]);
export default function Chart({
  keys,
  values,
  mode,
  onSelect,
}: {
  keys: string[];
  values: (number | null)[];
  mode: string;
  onSelect: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = init(ref.current);
    const counts = mode === "回数";
    const scatter = mode === "地震ごと";
    chart.setOption({
      useUTC: true,
      grid: { left: 52, right: 22, top: 40, bottom: 72 },
      tooltip: {
        trigger: "item",
        renderMode: "richText",
        formatter: scatter
          ? (p: { dataIndex: number }) =>
              keys[p.dataIndex].replace("T", " ") +
              " JST　震度" +
              labels[values[p.dataIndex] || 0]
          : undefined,
        valueFormatter: (v: number) => (counts ? v + "回" : "震度" + labels[v]),
      },
      xAxis: {
        type: scatter ? "time" : "category",
        data: scatter ? undefined : keys,
        axisLabel: { hideOverlap: true, color: "#56676a" },
      },
      yAxis: {
        type: "value",
        name: counts ? "回数" : "震度",
        min: 0,
        minInterval: 1,
        max: counts ? undefined : 11,
        axisLabel: {
          formatter: (x: number) =>
            counts ? String(x) : x === 0 ? "" : labels[x],
        },
        splitLine: { lineStyle: { color: "#e1e7e5" } },
      },
      dataZoom: [{ type: "slider", height: 15, bottom: 12, showDetail: false }],
      series: [
        {
          type: mode === "地震ごと" ? "scatter" : "bar",
          symbolSize: 8,
          barMaxWidth: 42,
          data: values.map((v, i) => ({
            value: scatter ? [Date.parse(keys[i] + "Z"), v] : v,
            itemStyle: { color: counts ? "#30786e" : colors[v || 0] },
          })),
        },
      ],
    });
    chart.on("click", (e) => onSelect(e.dataIndex));
    const obs = new ResizeObserver(() => chart.resize());
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      chart.dispose();
    };
  }, [keys, values, mode, onSelect]);
  return (
    <div
      ref={ref}
      style={{ height: 365 }}
      aria-label="期間別の震度と発生回数"
    />
  );
}
