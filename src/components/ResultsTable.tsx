import { useState, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, Table as TableIcon } from 'lucide-react';
import ChartAgent from '../charts/ChartAgent';
import { syncChartClient } from '../charts/apiClient';

interface ResultsTableProps {
  data: any[];
  useChartAgent?: boolean;
  userQuery?: string;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function ResultsTable({ data, useChartAgent = true, userQuery }: ResultsTableProps) {
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const keys = Object.keys(data[0]);
  
  const numericKeys = keys.filter(k => {
    const firstValue = data[0][k];
    return typeof firstValue === 'number' || !isNaN(Number(firstValue));
  });

  // Chart is possible if:
  // 1. Multiple rows with at least 2 columns (time series, comparisons, etc.)
  // 2. OR single row with multiple numeric columns (aggregated stats: mean, median, etc.)
  const isChartable = (keys.length >= 2 && data.length > 1) || 
                      (data.length === 1 && numericKeys.length >= 2);

  // Prepare hints for ChartAgent
  const chartHints = useMemo(() => 
    userQuery ? { query: userQuery } : undefined,
    [userQuery]
  );

  // Transform single-row aggregation data for charts
  let chartData = data;
  if (data.length === 1 && numericKeys.length >= 2) {
    chartData = numericKeys.map(key => ({
      statistic: key.replace(/_/g, ' '),
      value: data[0][key]
    }));
  }

  const labelKey = chartData.length > 1 && 'statistic' in chartData[0] ? 'statistic' : keys[0];
  const valueKey = chartData.length > 1 && 'value' in chartData[0] ? 'value' : (numericKeys[0] || keys[1]);

  return (
    <div className="my-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-700 dark:text-mining-text-secondary font-medium">Found {data.length} result{data.length !== 1 ? 's' : ''}</p>

        {isChartable && (
          <div className="flex gap-2">
            <button
              onClick={() => setView('table')}
              className={`p-2 rounded-lg transition-colors ${view === 'table' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              title="Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('chart')}
              className={`p-2 rounded-lg transition-colors ${view === 'chart' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              title="Chart View"
            >
              <BarChart3 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {view === 'table' ? (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-slate-300 dark:border-mining-border rounded-lg overflow-hidden">
            <thead className="bg-slate-100 dark:bg-mining-surface">
              <tr>
                {keys.map((key) => (
                  <th
                    key={key}
                    className="px-4 py-2 text-left text-xs font-semibold text-slate-700 dark:text-mining-text-secondary uppercase tracking-wider border-b border-slate-300 dark:border-mining-border"
                  >
                    {key.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-mining-surface divide-y divide-slate-200 dark:divide-mining-border">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  {keys.map((key) => (
                    <td key={key} className="px-4 py-2 text-sm text-slate-900 dark:text-mining-text whitespace-nowrap">
                      {row[key] !== null && row[key] !== undefined ? String(row[key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {useChartAgent ? (
            // Use new ChartAgent system
            <ChartAgent 
              data_sample={data}
              hints={chartHints}
              apiClient={syncChartClient}
              userId="default-user"
              sourceType="sql_result"
            />
          ) : (
            // Use legacy Recharts
            <>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-1 text-xs rounded ${chartType === 'bar' ? 'bg-blue-600 dark:bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                >
                  Bar
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`px-3 py-1 text-xs rounded ${chartType === 'line' ? 'bg-blue-600 dark:bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                >
                  Line
                </button>
                <button
                  onClick={() => setChartType('pie')}
                  className={`px-3 py-1 text-xs rounded ${chartType === 'pie' ? 'bg-blue-600 dark:bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}
                >
                  Pie
                </button>
              </div>

          <ResponsiveContainer width="100%" height={500}>
            {chartType === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={labelKey} angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                {data.length === 1 && numericKeys.length >= 2 ? (
                  <Bar dataKey="value" fill={COLORS[0]} />
                ) : (
                  numericKeys.map((key, idx) => (
                    <Bar key={key} dataKey={key} fill={COLORS[idx % COLORS.length]} />
                  ))
                )}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={labelKey} angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                {data.length === 1 && numericKeys.length >= 2 ? (
                  <Line type="monotone" dataKey="value" stroke={COLORS[0]} />
                ) : (
                  numericKeys.map((key, idx) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={COLORS[idx % COLORS.length]} />
                  ))
                )}
              </LineChart>
            ) : (
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey={valueKey}
                  nameKey={labelKey}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  label
                >
                  {chartData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            )}
          </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  );
}
