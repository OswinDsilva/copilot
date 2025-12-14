export const equipmentComboTemplate = `SELECT tipper_id, excavator, SUM(trip_count) as total_trips
FROM trip_summary_by_date
{{filters}}
GROUP BY tipper_id, excavator
ORDER BY total_trips DESC
LIMIT {{limit}}`;
