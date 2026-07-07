import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const SEGMENT_COLORS = {
  "Server response (TTFB)": "#2563eb",
  "DOM building": "#16a34a",
  "Asset loading": "#d97706",
  "4G download": "#7c3aed",
};

function parseMs(value) {
  if (value == null) return 0;
  const match = String(value).match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

function buildWaterfallData(metrics) {
  const ttfb = parseMs(metrics.SERVER_RESPONSE_LAG_TTFB);
  const domReady = parseMs(metrics.DOM_STRUCTURAL_READINESS);
  const render = parseMs(metrics.TOTAL_VISUAL_RENDER_TIME);
  const download4g = parseMs(metrics.ESTIMATED_4G_DOWNLOAD_DELAY);

  const domPhase = Math.max(domReady - ttfb, 0);
  const assetPhase = Math.max(render - domReady, 0);
  const networkPhase = Math.max(download4g - render, 0);

  const segments = [
  {
    name: "Server response (TTFB)",
    offset: 0,
    duration: ttfb,
    total: ttfb,
  },
  {
    name: "DOM building",
    offset: ttfb,
    duration: domPhase,
    total: domReady,
  },
  {
    name: "Asset loading",
    offset: domReady,
    duration: assetPhase,
    total: render,
  },
  {
    name: "4G download",
    offset: render,
    duration: networkPhase || download4g,
    total: Math.max(render + networkPhase, download4g),
  },
  ];

  return segments.filter((segment) => segment.duration > 0);
}

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const segment = payload.find((item) => item.dataKey === "duration")?.payload;
  if (!segment) return null;

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-slate-900">{segment.name}</p>
      <p className="text-slate-600">Starts: {Math.round(segment.offset)} ms</p>
      <p className="text-slate-600">Duration: {Math.round(segment.duration)} ms</p>
      <p className="text-slate-600">Ends: {Math.round(segment.offset + segment.duration)} ms</p>
    </div>
  );
}

export default function PerformanceWaterfallChart({ metrics }) {
  const data = buildWaterfallData(metrics);
  if (data.length === 0) return null;

  const maxTime = Math.max(...data.map((item) => item.offset + item.duration));

  return (
    <div className="mt-5">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        Performance waterfall
      </p>
      <p className="text-xs text-slate-500 mb-3">
        Each segment starts where the previous phase ends, showing how load time adds up.
      </p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
            <XAxis
              type="number"
              domain={[0, Math.ceil(maxTime * 1.1)]}
              tick={{ fontSize: 12 }}
              unit=" ms"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fontSize: 11 }}
            />
            <Tooltip content={<WaterfallTooltip />} />
            <Bar dataKey="offset" stackId="waterfall" fill="transparent" />
            <Bar dataKey="duration" stackId="waterfall" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={SEGMENT_COLORS[entry.name]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: SEGMENT_COLORS[entry.name] }}
            />
            <span>{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
