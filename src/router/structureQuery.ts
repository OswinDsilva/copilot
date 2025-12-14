export interface StructuredQuery {
  question: string;
  intent: string;
  params: Record<string, any>;
  time: string | number | null;
  equipment: string[] | null;
  limit: number | null;
  shift: string[] | null;
  rank_type: string | null;
}

export function structureQuery(
  question: string, 
  intent: string, 
  params: Record<string, any>
): StructuredQuery {
  return {
    question,
    intent,
    params,
    time: params.date || params.month || params.date_range || null,
    equipment: params.machines || null,
    limit: params.n || null,
    shift: params.shift || null,
    rank_type: params.rank_type || null
  };
}
