import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { colors, labels, get, type EventRow } from "./data";
type Observation = [string | null, string, number];
export default function MapView({
  event,
  version,
  cities,
}: {
  event: EventRow;
  version: string;
  cities: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, set] = useState("");
  useEffect(() => {
    if (!ref.current) return;
    let active = true;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(
      [36, 138],
      5,
    );
    set("地図を読み込み中…");
    Promise.all([
      get<Topology<{ japan: GeometryCollection }>>("geo/japan.json"),
      get<Record<string, Observation[]>>(
        "data/map/" + event.at.slice(0, 7) + "/" + event.block + ".json.gz",
        version,
      ),
      get<Record<string, [string, number, number]>>("data/stations.json.gz"),
    ])
      .then(([top, block, stations]) => {
        if (!active) return;
        L.geoJSON(feature(top, Object.values(top.objects)[0]), {
          interactive: false,
          style: {
            color: "#8aaba1",
            weight: 1,
            fillColor: "#e5eee6",
            fillOpacity: 1,
          },
        }).addTo(map);
        const layer = L.layerGroup().addTo(map),
          bounds = L.latLngBounds([]);
        type Mark = {
          pos: L.LatLngTuple;
          name: string;
          s: number;
          city: string | null;
        };
        const fine: Mark[] = [];
        for (const [city, id, s] of block[event.id] || []) {
          const station = stations[id];
          if (station && s) {
            const pos: L.LatLngTuple = [station[1], station[2]];
            fine.push({ pos, name: station[0], s, city });
            bounds.extend(pos);
          }
        }
        const coarse = new Map<string, Mark>();
        for (const m of fine)
          if (m.city && (coarse.get(m.city)?.s || 0) < m.s)
            coarse.set(m.city, {
              ...m,
              name: cities[m.city] || m.name,
              s: event.local[m.city] || m.s,
            });
        function draw() {
          layer.clearLayers();
          for (const m of map.getZoom() >= 10 ? fine : [...coarse.values()]) {
            const el = document.createElement("b");
            el.className = "pin";
            el.style.background = colors[m.s];
            el.textContent = labels[m.s];
            const label = document.createElement("span");
            label.textContent = m.name + "　震度" + labels[m.s];
            L.marker(m.pos, {
              icon: L.divIcon({
                html: el,
                className: "",
                iconSize: [25, 25],
                iconAnchor: [12, 12],
              }),
            })
              .bindTooltip(label)
              .addTo(layer);
          }
        }
        if (event.lat !== null && event.lon !== null) {
          const pos: L.LatLngTuple = [event.lat, event.lon];
          bounds.extend(pos);
          L.marker(pos, {
            zIndexOffset: 500,
            icon: L.divIcon({
              html: "✕",
              className: "epicenter",
              iconSize: [22, 22],
            }),
          })
            .bindTooltip("震央")
            .addTo(map);
        }
        if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: 10 });
        map.on("zoomend", draw);
        draw();
        set(
          fine.length
            ? "数字は市区町村の最大震度。拡大すると観測点別に表示します。"
            : "観測点の位置が収録されていません。",
        );
      })
      .catch(() => active && set("地図データを取得できませんでした。"));
    return () => {
      active = false;
      map.remove();
    };
  }, [event, version, cities]);
  return (
    <>
      <div className="map" ref={ref} />
      <p className="note">{status}　✕ 震央</p>
    </>
  );
}
