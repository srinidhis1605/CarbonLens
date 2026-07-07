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

const COLORS = ["#16a34a", "#2563eb", "#d97706", "#7c3aed"];

const LABEL_MAP = {
  BINARY_IMAGES: "Images",
  CLIENT_JS_SCRIPTS: "Scripts",
  COMPRESSED_STYLES: "Styles",
  EMBEDDED_FONTS: "Fonts",
};

function parseWeightMb(value) {
  if (value == null) return 0;
  const match = String(value).match(/([\d.]+)/);
  return match ? Number(match[1]) : 0;
}

export default function AssetBreakdownChart({ payloads = [] }) {
  const data = payloads
    .map((item) => ({
      name: LABEL_MAP[item.CLASSIFICATION] || item.CLASSIFICATION,
      weightMb: parseWeightMb(item.RAW_WEIGHT),
      count: Number(item.COUNT) || 0,
    }))
    .filter((item) => item.weightMb > 0 || item.count > 0);

  if (data.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">
        Asset breakdown (MB)
      </p>
      <div className="h-40 w-full max-w-md">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit=" MB" />
            <Tooltip
              formatter={(value, name) => [
                name === "weightMb" ? `${value} MB` : value,
                name === "weightMb" ? "Weight" : "Count",
              ]}
            />
            <Bar dataKey="weightMb" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
