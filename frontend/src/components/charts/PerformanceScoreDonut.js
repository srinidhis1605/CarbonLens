import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

function parseScore(scoreText) {
  if (scoreText == null) return 0;
  const match = String(scoreText).match(/(\d+)/);
  return match ? Math.min(100, Math.max(0, Number(match[1]))) : 0;
}

function scoreColor(score) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#ca8a04";
  return "#dc2626";
}

export default function PerformanceScoreDonut({ scoreText, grade }) {
  const score = parseScore(scoreText);
  const chartData = [
    { name: "Score", value: score },
    { name: "Remaining", value: 100 - score },
  ];

  return (
    <div className="h-44 w-full relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            innerRadius={52}
            outerRadius={72}
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            <Cell fill={scoreColor(score)} />
            <Cell fill="#e2e8f0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-2xl font-semibold text-slate-900">{score}</p>
        <p className="text-xs text-slate-500">/ 100</p>
        {grade && (
          <p className="mt-1 text-sm font-medium text-slate-700">Grade {grade}</p>
        )}
      </div>
    </div>
  );
}
