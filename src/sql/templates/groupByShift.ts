export const groupByShiftTemplate = `SELECT shift, SUM({{metric}}) AS total_{{metric}}
FROM {{table}}
WHERE {{filters}}
GROUP BY shift
ORDER BY shift`;
