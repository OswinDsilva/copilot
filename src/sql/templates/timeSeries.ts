export const timeSeriesTemplate = `SELECT date, {{metric}}
FROM {{table}}
WHERE {{filters}}
ORDER BY date`;
