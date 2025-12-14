import { useCallback, useMemo, useRef } from "react";
import type {
  ChartConfig,
  ChartData,
  XYChartConfig,
  PieChartConfig,
  ScatterChartConfig,
  HeatmapChartConfig,
  RadarChartConfig,
  ParetoChartConfig,
  CustomChartConfig,
  ChartRow,
} from "./types";

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend as ReLegend,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

// ---------------------------------------------------------------------------
// Clean ChartRenderer.tsx
// - Matches the shapes in your types.ts (x_column, y_columns, category_column, etc.)
// - Uses Recharts for XY/Composed, Pie, Scatter, Radar
// - Heatmap uses small SVG fallback for portability
// - Defensive: validates required fields, normalizes numeric values, guards empty data
// - Exposes CSV/SVG export helpers
// ---------------------------------------------------------------------------

type Props = {
  config: ChartConfig;
  data?: ChartData;
  responsive?: boolean; // default true
  width?: number; // used for SVG/heatmap fallback
  height?: number; // preferred height
  palette?: string[]; // optional color palette
  onPointClick?: (payload: any) => void;
  onHover?: (payload: any) => void;
  exportable?: boolean;
  className?: string;
};

const DEFAULT_COLORS = [
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#F97316",
  "#3B82F6",
];

function pickColor(i: number, palette?: string[]) {
  const p = palette && palette.length ? palette : DEFAULT_COLORS;
  return p[i % p.length];
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? (v as number) : null;
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function rowsToCSV(rows: ChartData | undefined) {
  if (!rows || rows.length === 0) return "";
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const escape = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [keys.join(",")];
  for (const r of rows) lines.push(keys.map((k) => escape(r[k])).join(","));
  return lines.join("\n");
}

async function downloadSVG(svgEl: SVGSVGElement | null, filename = "chart.svg") {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeRows(data?: ChartData): ChartRow[] {
  // Accept several possible shapes we might get from backend:
  // - ChartData (array of rows)
  // - { rows: ChartData }
  // - { columns: [...], data: Array<Array<any>> }
  if (!data) return [];

  // If already an array of rows
  if (Array.isArray(data)) return data as ChartRow[];

  // If it's an object with a `rows` property
  const anyData = data as any;
  if (anyData && Array.isArray(anyData.rows)) return anyData.rows as ChartRow[];

  // If it's a typical columns+data matrix shape
  if (anyData && Array.isArray(anyData.columns) && Array.isArray(anyData.data)) {
    try {
      const cols: string[] = anyData.columns.map((c: any) => c.name || c);
      return (anyData.data as any[]).map((row: any[]) => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < cols.length; i++) obj[cols[i]] = row[i];
        return obj;
      });
    } catch {
      return [];
    }
  }

  return [];
}

function Empty({ message }: { message?: string }) {
  return (
    <div className="p-4 text-center text-sm text-gray-600" role="status">
      {message ?? "No data to display"}
    </div>
  );
}

// ---------------------- XY Adapter (ComposedChart) ----------------------
function XYAdapter({ config, rows, palette, height, onPointClick: _onPointClick, onHover: _onHover }: {
  config: XYChartConfig;
  rows: ChartRow[];
  palette?: string[];
  height?: number;
  onPointClick?: (p: any) => void;
  onHover?: (p: any) => void;
}) {
  const xCol = config.x_column;
  const yCols = config.y_columns ?? [];
  const chartType = config.chart_type; // 'bar' | 'line' | 'area'

  if (!xCol || !yCols || yCols.length === 0) return <Empty message={config.title ?? "No chart data"} />;

  const normalized = useMemo(() => {
    return rows.map((r) => {
      const copy: ChartRow = { ...r };
      for (const yc of yCols) copy[yc] = toNumberOrNull(copy[yc]);
      return copy;
    });
  }, [rows, yCols]);

  const chartHeight = height ?? 320;

  return (
    <div role="img" aria-label={config.title ?? "XY chart"}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={normalized} margin={{ top: 8, right: 16, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={xCol} />
          <YAxis />
          <ReTooltip formatter={(v: any) => (v == null ? "—" : String(v))} />
          {config.legend !== false && <ReLegend />}

          {yCols.map((yc, idx) => {
            const color = pickColor(idx, palette);
            const key = `${yc}`;
            if (chartType === "bar") return <Bar key={key} dataKey={yc} name={yc} fill={color} />;
            if (chartType === "area") return <Area key={key} dataKey={yc} name={yc} fill={color} stroke={color} type="monotone" />;
            return <Line key={key} dataKey={yc} name={yc} stroke={color} dot={{ r: 2 }} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ----------------------------- Pie adapter -----------------------------
function PieAdapter({ config, rows, palette, height, onPointClick: _onPointClick }: {
  config: PieChartConfig;
  rows: ChartRow[];
  palette?: string[];
  height?: number;
  onPointClick?: (p: any) => void;
}) {
  const cat = config.category_column;
  const val = config.value_column;
  if (!cat || !val) return <Empty message={config.title ?? "No data for pie"} />;

  const aggregated = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r[cat] == null ? "(null)" : String(r[cat]);
      const n = toNumberOrNull(r[val]) ?? 0;
      m.set(k, (m.get(k) ?? 0) + n);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [rows, cat, val]);

  if (aggregated.length === 0) return <Empty message={config.title ?? "No data for pie"} />;

  const chartHeight = height ?? 300;

  return (
    <div role="img" aria-label={config.title ?? "Pie chart"}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie data={aggregated} dataKey="value" nameKey="name" outerRadius={Math.min(chartHeight / 2 - 10, 120)} label>
            {aggregated.map((_entry, i) => (
              <Cell key={`c-${i}`} fill={pickColor(i, palette)} />
            ))}
          </Pie>
          <ReTooltip formatter={(v: any) => (v == null ? "—" : String(v))} />
          {config.legend !== false && <ReLegend />}
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------- Scatter adapter ---------------------------
function ScatterAdapter({ config, rows, palette, height, onPointClick }: {
  config: ScatterChartConfig;
  rows: ChartRow[];
  palette?: string[];
  height?: number;
  onPointClick?: (p: any) => void;
}) {
  const x = config.x_column;
  const y = config.y_column;
  if (!x || !y) return <Empty message={config.title ?? "No data for scatter"} />;

  const normalized = useMemo(() => rows.map((r) => ({ __x: toNumberOrNull(r[x]), __y: toNumberOrNull(r[y]), ...r })), [rows, x, y]);
  const chartHeight = height ?? 320;

  return (
    <div role="img" aria-label={config.title ?? "Scatter chart"}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis dataKey="__x" />
          <YAxis />
          <ReTooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={normalized} fill={pickColor(0, palette)} onClick={(d: any) => onPointClick?.(d)} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------- Radar adapter ---------------------------
function RadarAdapter({ config, rows, palette, height }: {
  config: RadarChartConfig;
  rows: ChartRow[];
  palette?: string[];
  height?: number;
}) {
  const category = config.category_column;
  const axes = config.axes ?? [];
  if (!category || axes.length === 0) return <Empty message={config.title ?? "No data for radar"} />;

  const chartHeight = height ?? 360;

  return (
    <div role="img" aria-label={config.title ?? "Radar chart"}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <RadarChart data={rows} outerRadius={Math.min(140, chartHeight / 2 - 10)}>
          <PolarGrid />
          <PolarAngleAxis dataKey={category} />
          <PolarRadiusAxis />
          {axes.map((a, idx) => (
            <Radar key={a} name={a} dataKey={a} stroke={pickColor(idx, palette)} fill={pickColor(idx, palette)} fillOpacity={0.3} />
          ))}
          <ReTooltip />
          {config.legend !== false && <ReLegend />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------- Pareto adapter ---------------------------
function ParetoAdapter({ config, rows, palette, height }: {
  config: ParetoChartConfig;
  rows: ChartRow[];
  palette?: string[];
  height?: number;
}) {
  const cat = config.category_column;
  const val = config.value_column;
  if (!cat || !val) return <Empty message={config.title ?? "No data for pareto"} />;

  const aggregated = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = r[cat] == null ? "(null)" : String(r[cat]);
      const n = toNumberOrNull(r[val]) ?? 0;
      m.set(k, (m.get(k) ?? 0) + n);
    }
    const arr = Array.from(m.entries()).map(([k, v]) => ({ category: k, value: v }));
    arr.sort((a, b) => (config.sort === "asc" ? a.value - b.value : b.value - a.value));
    const total = arr.reduce((s, x) => s + x.value, 0) || 1;
    let cum = 0;
    return arr.map((x) => {
      cum += x.value;
      return { ...x, cumulative: (cum / total) * 100 };
    });
  }, [rows, cat, val, config.sort]);

  const chartHeight = height ?? 360;

  return (
    <div role="img" aria-label={config.title ?? "Pareto chart"}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={aggregated} margin={{ top: 8, right: 40, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="category" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
          <ReTooltip />
          <Bar yAxisId="left" dataKey="value" fill={pickColor(0, palette)} />
          <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke={pickColor(1, palette)} />
          {config.legend !== false && <ReLegend />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------- Heatmap adapter (SVG) ---------------------------
function HeatmapAdapter({ config, rows, palette, width = 600, height = 320 }: {
  config: HeatmapChartConfig;
  rows: ChartRow[];
  palette?: string[];
  width?: number;
  height?: number;
}) {
  const xCol = config.x_column;
  const yCol = config.y_column;
  const vCol = config.value_column;
  if (!xCol || !yCol || !vCol) return <Empty message={config.title ?? "No data for heatmap"} />;
  if (!rows || rows.length === 0) return <Empty message={config.title ?? "No data for heatmap"} />;

  const xs = Array.from(new Set(rows.map((r) => String(r[xCol])))).sort();
  const ys = Array.from(new Set(rows.map((r) => String(r[yCol])))).sort();
  
  // Reserve space for labels
  const leftMargin = 80;
  const topMargin = 60;
  const bottomMargin = 40;
  const rightMargin = 20;
  
  const chartWidth = width - leftMargin - rightMargin;
  const chartHeight = height - topMargin - bottomMargin;
  
  const cellW = xs.length ? chartWidth / xs.length : chartWidth;
  const cellH = ys.length ? chartHeight / ys.length : chartHeight;
  const values = rows.map((r) => toNumberOrNull(r[vCol]) ?? 0);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const colorFor = (v: number) => {
    if (max === min) return pickColor(0, palette);
    const t = (v - min) / (max - min);
    const c0 = pickColor(0, palette).slice(1);
    const c1 = pickColor(1, palette).slice(1);
    const r0 = parseInt(c0.slice(0, 2), 16), g0 = parseInt(c0.slice(2, 4), 16), b0 = parseInt(c0.slice(4, 6), 16);
    const r1 = parseInt(c1.slice(0, 2), 16), g1 = parseInt(c1.slice(2, 4), 16), b1 = parseInt(c1.slice(4, 6), 16);
    const rr = Math.round(r0 + (r1 - r0) * t), gg = Math.round(g0 + (g1 - g0) * t), bb = Math.round(b0 + (b1 - b0) * t);
    return `rgb(${rr},${gg},${bb})`;
  };

  return (
    <svg role="img" aria-label={config.title ?? "Heatmap"} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" width="100%">
      {/* Heatmap cells */}
      {rows.map((r, i) => {
        const xIdx = xs.indexOf(String(r[xCol]));
        const yIdx = ys.indexOf(String(r[yCol]));
        const val = toNumberOrNull(r[vCol]) ?? 0;
        const fill = colorFor(val);
        return (
          <g key={i}>
            <rect
              x={leftMargin + xIdx * cellW}
              y={topMargin + yIdx * cellH}
              width={cellW}
              height={cellH}
              fill={fill}
              stroke="white"
              strokeWidth={0.5}
            />
            {/* Cell value label */}
            <text
              x={leftMargin + xIdx * cellW + cellW / 2}
              y={topMargin + yIdx * cellH + cellH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="10"
              fontWeight="bold"
              style={{ textShadow: '0 0 2px rgba(0,0,0,0.5)' }}
            >
              {val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}
            </text>
          </g>
        );
      })}
      
      {/* X-axis labels (top) */}
      {xs.map((x, i) => (
        <text
          key={`x-${i}`}
          x={leftMargin + i * cellW + cellW / 2}
          y={topMargin - 10}
          textAnchor="middle"
          fontSize="11"
          fill="#333"
        >
          {x}
        </text>
      ))}
      
      {/* Y-axis labels (left) */}
      {ys.map((y, i) => (
        <text
          key={`y-${i}`}
          x={leftMargin - 10}
          y={topMargin + i * cellH + cellH / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize="11"
          fill="#333"
        >
          {y}
        </text>
      ))}
      
      {/* Chart title */}
      {config.title && (
        <text
          x={width / 2}
          y={20}
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          className="fill-slate-700 dark:fill-mining-text"
        >
          {config.title}
        </text>
      )}
    </svg>
  );
}

// --------------------------- Custom adapter ---------------------------
function CustomAdapter({ config, rows: _rows }: { config: CustomChartConfig; rows: ChartRow[] }) {
  return <Empty message={config.title ?? "Custom chart type — implement your renderer"} />;
}

// --------------------------- Main renderer ---------------------------
export default function ChartRenderer(props: Props) {
  const { config, data, responsive: _responsive = true, width, height, palette, onPointClick, onHover, exportable = true, className } = props;
  const rows = useMemo(() => normalizeRows(data), [data]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleExportCSV = useCallback(() => {
    const csv = rowsToCSV(rows as ChartData);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (config.title ?? "chart") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, config.title]);

  const handleExportSVG = useCallback(() => {
    const container = containerRef.current;
    const svg = container?.querySelector("svg") as SVGSVGElement | null;
    if (svg) downloadSVG(svg, (config.title ?? "chart") + ".svg");
    else console.warn("No SVG found to export");
  }, [config.title]);

  const adapter = useMemo(() => {
    switch (config.chart_type) {
      case "bar":
      case "line":
      case "area":
        return "xy";
      case "pie":
        return "pie";
      case "scatter":
        return "scatter";
      case "radar":
        return "radar";
      case "pareto":
        return "pareto";
      case "heatmap":
        return "heatmap";
      case "custom":
        return "custom";
      default:
        return "xy";
    }
  }, [config.chart_type]);

  return (
    <div className={className} ref={(el) => (containerRef.current = el)}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold">{config.title}</div>
        </div>
        {exportable && (
          <div className="flex gap-2">
            <button type="button" onClick={handleExportCSV} className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Export CSV</button>
            <button type="button" onClick={handleExportSVG} className="px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Export SVG</button>
          </div>
        )}
      </div>

      <div className="rounded bg-white dark:bg-mining-surface p-2 shadow-sm">
        {adapter === "xy" && <XYAdapter config={config as XYChartConfig} rows={rows} palette={palette} height={height} onPointClick={onPointClick} onHover={onHover} />}
        {adapter === "pie" && <PieAdapter config={config as PieChartConfig} rows={rows} palette={palette} height={height} onPointClick={onPointClick} />}
        {adapter === "scatter" && <ScatterAdapter config={config as ScatterChartConfig} rows={rows} palette={palette} height={height} onPointClick={onPointClick} />}
        {adapter === "radar" && <RadarAdapter config={config as RadarChartConfig} rows={rows} palette={palette} height={height} />}
        {adapter === "pareto" && <ParetoAdapter config={config as ParetoChartConfig} rows={rows} palette={palette} height={height} />}
        {adapter === "heatmap" && <HeatmapAdapter config={config as HeatmapChartConfig} rows={rows} palette={palette} width={width ?? 600} height={height ?? 320} />}
        {adapter === "custom" && <CustomAdapter config={config as CustomChartConfig} rows={rows} />}
      </div>
    </div>
  );
}
