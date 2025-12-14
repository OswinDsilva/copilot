import { timeSeriesTemplate } from "./templates/timeSeries";
import { summaryTemplate } from "./templates/summary";
import { groupByShiftTemplate } from "./templates/groupByShift";
import { equipmentComboTemplate } from "./templates/combination";
import type { QueryType } from "../router/detectQueryType";

export function selectTemplate(type: QueryType): string | null {
  switch (type) {
    case "time_series":
      return timeSeriesTemplate;
    case "summary":
      return summaryTemplate;
    case "shift_grouping":
      return groupByShiftTemplate;
    case "equipment_combo":
      return equipmentComboTemplate;
    default:
      return null;
  }
}

export function applyTemplate(template: string, parameters: Record<string, any>): string {
  let sql = template;

  // Replace placeholders
  Object.keys(parameters).forEach(key => {
    const value = parameters[key];
    const placeholder = `{{${key}}}`;
    
    if (sql.includes(placeholder)) {
      if (value === null || value === undefined) {
        // Remove placeholder and clean up
        sql = sql.replace(placeholder, '');
      } else {
        sql = sql.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }
  });

  // Clean up empty WHERE clauses
  sql = sql.replace(/WHERE\s+$/i, '');
  sql = sql.replace(/WHERE\s+AND/i, 'WHERE');
  sql = sql.replace(/WHERE\s+GROUP BY/i, 'GROUP BY');
  sql = sql.replace(/WHERE\s+ORDER BY/i, 'ORDER BY');

  // Clean up extra whitespace
  sql = sql.replace(/\s+/g, ' ').trim();

  return sql;
}
