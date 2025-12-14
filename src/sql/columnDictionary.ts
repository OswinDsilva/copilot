export const columnDictionary: Record<string, string[]> = {
  production_summary: [
    'date', 'shift', 'excavator', 'dumper',
    'trip_count_for_mining', 'qty_ton', 'trip_count_for_reclaim',
    'qty_m3', 'total_trips', 'grader', 'dozer'
  ],
  trip_summary_by_date: [
    'trip_date', 'shift', 'tipper_id', 'excavator',
    'route_or_face', 'trip_count'
  ],
  equipment: ['id', 'name', 'type'],
  uploaded_files: ['id', 'filename', 'uploaded_at'],
  chat_history: ['id', 'user_id', 'question', 'answer', 'created_at'],
  users: ['id', 'email', 'created_at']
};
