export const summaryTemplate = `SELECT SUM({{metric}}) AS total_{{metric}}
FROM {{table}}
WHERE {{filters}}`;
