import type { ChartConfig, ChartData, ChartType } from './types';

/**
 * Extracts explicit chart type from user query
 */
export function extractRequestedChartType(query?: string): ChartType | null {
  if (!query) return null;
  
  const q = query.toLowerCase();
  
  // Check for explicit chart type requests
  if (/\bheatmap\b/i.test(q)) return 'heatmap';
  if (/\bpareto\b/i.test(q)) return 'pareto';
  if (/\bradar\b|spider\s+chart/i.test(q)) return 'radar';
  if (/\bscatter\b/i.test(q)) return 'scatter';
  if (/\bpie\s+chart\b|\bpie\b/i.test(q)) return 'pie';
  if (/\barea\s+chart\b|\barea\b/i.test(q)) return 'area';
  if (/\bline\s+chart\b|\bline\s+graph\b/i.test(q)) return 'line';
  if (/\bbar\s+chart\b|\bbar\s+graph\b/i.test(q)) return 'bar';
  
  return null;
}

/**
 * Detects the best chart type based on data characteristics
 * If requestedType is provided, validates it's appropriate for the data
 */
export function detectChartType(data: ChartData, requestedType?: ChartType | null): ChartConfig {
  if (!data || data.length === 0) {
    return { chart_type: 'bar', x_column: '', y_columns: [] };
  }

  const keys = Object.keys(data[0]);
  const numericCols = keys.filter(k => {
    const val = data[0][k];
    return typeof val === 'number' || !isNaN(Number(val));
  });
  
  const categoricalCols = keys.filter(k => !numericCols.includes(k));
  
  // Detect date/time columns
  const hasDate = keys.some(k => 
    /date|time|month|year|day|week/i.test(k) ||
    (typeof data[0][k] === 'string' && /\d{4}-\d{2}-\d{2}/.test(data[0][k] as string))
  );
  
  // Detect month names (January, February, etc.)
  const hasMonthName = keys.some(k => {
    const val = data[0][k];
    return typeof val === 'string' && /january|february|march|april|may|june|july|august|september|october|november|december/i.test(val);
  });

  // If user requested a specific chart type, try to honor it
  if (requestedType) {
    switch (requestedType) {
      case 'heatmap':
        if (categoricalCols.length >= 2 && numericCols.length >= 1) {
          return {
            chart_type: 'heatmap',
            x_column: categoricalCols[0],
            y_column: categoricalCols[1],
            value_column: numericCols[0],
            title: 'Heatmap',
            legend: true,
            tooltip: true
          };
        }
        break;
        
      case 'pareto':
        if (categoricalCols.length >= 1 && numericCols.length >= 1) {
          return {
            chart_type: 'pareto',
            category_column: categoricalCols[0],
            value_column: numericCols[0],
            sort: 'desc',
            title: 'Pareto Chart',
            legend: true,
            tooltip: true
          };
        }
        break;
        
      case 'radar':
        if (categoricalCols.length >= 1 && numericCols.length >= 3) {
          return {
            chart_type: 'radar',
            category_column: categoricalCols[0],
            axes: numericCols,
            title: 'Radar Chart',
            legend: true,
            tooltip: true
          };
        }
        break;
        
      case 'scatter':
        if (numericCols.length >= 2) {
          return {
            chart_type: 'scatter',
            x_column: numericCols[0],
            y_column: numericCols[1],
            size: numericCols[2],
            title: 'Scatter Plot',
            legend: false,
            tooltip: true
          };
        }
        break;
        
      case 'pie':
        if (categoricalCols.length >= 1 && numericCols.length >= 1) {
          return {
            chart_type: 'pie',
            category_column: categoricalCols[0],
            value_column: numericCols[0],
            title: `${numericCols[0]} by ${categoricalCols[0]}`,
            legend: true,
            tooltip: true
          };
        }
        break;
        
      case 'area':
      case 'line':
      case 'bar':
        const xCol = (hasDate || hasMonthName) 
          ? (hasMonthName 
              ? keys.find(k => typeof data[0][k] === 'string' && /january|february|march|april|may|june|july|august|september|october|november|december/i.test(data[0][k] as string))
              : keys.find(k => /date|time|month/i.test(k)))
          : categoricalCols[0] || keys[0];
        
        return {
          chart_type: requestedType,
          x_column: xCol || keys[0],
          y_columns: numericCols.length > 0 ? numericCols : [keys[1] || keys[0]],
          x_type: hasMonthName ? 'categorical' : (hasDate ? 'datetime' : 'categorical'),
          title: `${requestedType.charAt(0).toUpperCase() + requestedType.slice(1)} Chart`,
          legend: numericCols.length > 1,
          tooltip: true
        };
    }
  }

  // Default behavior: detect best chart type automatically

  // Time series chart (line/area)
  if ((hasDate || hasMonthName) && numericCols.length >= 1) {
    const xCol = hasMonthName 
      ? keys.find(k => typeof data[0][k] === 'string' && /january|february|march|april|may|june|july|august|september|october|november|december/i.test(data[0][k] as string))
      : keys.find(k => /date|time|month/i.test(k));
    
    return {
      chart_type: data.length > 20 ? 'line' : 'bar',
      x_column: xCol || keys[0],
      y_columns: numericCols,
      x_type: hasMonthName ? 'categorical' : 'datetime',
      title: 'Production Over Time',
      legend: numericCols.length > 1,
      tooltip: true
    };
  }

  // Single categorical + single numeric = pie or bar
  if (categoricalCols.length === 1 && numericCols.length === 1) {
    // Use pie for small datasets with distinct categories
    if (data.length <= 10) {
      return {
        chart_type: 'pie',
        category_column: categoricalCols[0],
        value_column: numericCols[0],
        title: `${numericCols[0]} by ${categoricalCols[0]}`,
        legend: true,
        tooltip: true
      };
    }
    
    // Bar chart for larger datasets
    return {
      chart_type: 'bar',
      x_column: categoricalCols[0],
      y_columns: numericCols,
      title: `${numericCols[0]} by ${categoricalCols[0]}`,
      legend: false,
      tooltip: true
    };
  }

  // Multiple numeric columns = multi-series bar chart
  if (categoricalCols.length >= 1 && numericCols.length >= 2) {
    return {
      chart_type: 'bar',
      x_column: categoricalCols[0],
      y_columns: numericCols,
      title: 'Comparison',
      legend: true,
      tooltip: true
    };
  }

  // Equipment or route ranking (equipment_id, tipper_id, route_or_face patterns)
  const hasEquipmentCol = keys.some(k => /tipper|excavator|equipment|dumper|machine/i.test(k));
  const hasRouteCol = keys.some(k => /route|face|location|area/i.test(k));
  
  if ((hasEquipmentCol || hasRouteCol) && numericCols.length >= 1) {
    const xCol = keys.find(k => /tipper|excavator|equipment|route|face/i.test(k)) || keys[0];
    return {
      chart_type: 'bar',
      x_column: xCol,
      y_columns: numericCols,
      title: `${numericCols[0]} by ${xCol}`,
      legend: false,
      tooltip: true
    };
  }

  // Default: bar chart
  return {
    chart_type: 'bar',
    x_column: keys[0],
    y_columns: numericCols.length > 0 ? numericCols : [keys[1] || keys[0]],
    title: 'Data Overview',
    legend: numericCols.length > 1,
    tooltip: true
  };
}

/**
 * Validates and normalizes chart data
 */
export function normalizeChartData(data: any[]): ChartData {
  if (!Array.isArray(data)) return [];
  
  return data.map(row => {
    const normalized: Record<string, string | number | null> = {};
    
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        normalized[key] = null;
      } else if (typeof value === 'number') {
        normalized[key] = value;
      } else if (typeof value === 'string') {
        // Try to parse as number if it looks numeric
        const num = Number(value);
        normalized[key] = !isNaN(num) && value.trim() !== '' ? num : value;
      } else {
        normalized[key] = String(value);
      }
    }
    
    return normalized;
  });
}
