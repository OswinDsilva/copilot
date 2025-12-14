// Example statistical query templates for common month-based stats
export const STATISTICAL_QUERY_TEMPLATES: StatisticalQueryTemplate[] = [
  {
    operations: ['mean', 'median', 'mode', 'stddev'],
    targetColumn: 'qty_ton',
    groupBy: 'month',
    // No filters: applies to all months
  },
  {
    operations: ['mean', 'stddev'],
    targetColumn: 'qty_ton',
    groupBy: 'month',
    filters: { month: 'July' }
  },
  {
    operations: ['mean', 'median', 'mode', 'stddev'],
    targetColumn: 'qty_ton',
    groupBy: 'month',
    filters: { month: 'January' }
  }
];
export type UserRole = 'admin' | 'analyst' | 'viewer';

export type FileType = 'CSV' | 'XLSX' | 'PDF' | 'DOCX';

export type FileStatus = 'pending' | 'indexing' | 'ready' | 'error';

export type RouteType = 'sql' | 'rag' | 'optimize';

export type DBChoice = 'bolt' | 'supabase';

export type VectorStore = 'faiss' | 'pgvector';

// Statistical query template for advanced stats (mean, median, mode, stddev)
export interface StatisticalQueryTemplate {
  operations: Array<'mean' | 'median' | 'mode' | 'stddev'>;
  targetColumn: string;
  groupBy?: string; // e.g., 'EXTRACT(MONTH FROM date)', 'shift', etc.
  filters?: Record<string, any>; // Can include 'month' (single) or 'months' (array)
  selectMonthName?: boolean; // Whether to include month identifier in SELECT
  queryType?: 'simple' | 'multi_month' | 'ranking' | 'chart'; // Query classification
  orderBy?: string; // Signal for ORDER BY detection (e.g., 'detect_from_question')
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface UploadedFile {
  id: string;
  user_id: string;
  filename: string;
  file_type: FileType;
  size_bytes: number;
  namespace: string;
  status: FileStatus;
  progress: number;
  doc_count: number;
  version: number;
  error_message?: string;
  uploaded_at: string;
  indexed_at?: string;
}

export interface RAGChunk {
  id: string;
  file_id: string;
  namespace: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  chunk_index: number;
  created_at: string;
}

export interface Citation {
  file_name: string;
  page_or_row: string | number;
  sheet?: string;
  content: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  route_taken: RouteType;
  route_source?: 'deterministic' | 'llm';
  detected_intent?: string;
  intent_confidence?: number;
  matched_keywords?: string[];
  parameters?: Record<string, any>;
  template_used?: string;
  confidence: number;
  manual_override: boolean;
  sql_query?: string;
  citations?: Citation[];
  tokens_used: number;
  latency_ms: number;
  created_at: string;
}

export interface RAGSettings {
  id: string;
  user_id: string;
  row_chunk_size: number;
  chunk_overlap: number;
  top_k: number;
  search_combined: boolean;
  embedding_model: string;
  db_choice: DBChoice;
  supabase_url?: string;
  supabase_key?: string;
  vector_store: VectorStore;
  openai_api_key?: string;
  updated_at: string;
}

export interface DiagnosticEntry {
  id: string;
  user_id: string;
  request_type: string;
  path_taken?: string;
  latency_ms: number;
  tokens_used: number;
  cache_hit: boolean;
  error?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface RouterDecision {
  task: RouteType;
  confidence: number;
  tables?: string[];
  columns?: string[];
  filters?: string[];
  metrics?: string[];
  time_range?: string;
  keywords?: string[];
  namespaces?: string[];
  reason: string;
  original_question?: string;
  route_source?: 'deterministic' | 'llm';
  intent?: string;
  intent_confidence?: number;
  intent_keywords?: string[];
  parameters?: Record<string, any>;
  template_used?: string;
  statisticalTemplate?: StatisticalQueryTemplate;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'scatter' | 'combo';
  xAxis: string;
  yAxes: string[];
  groupBy?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  topN?: number;
  sortBy?: string;
  movingAverage?: number;
}

export interface CannedQuestion {
  id: string;
  label: string;
  question: string;
  expectedRoute: RouteType;
}

export const CANNED_QUESTIONS: CannedQuestion[] = [
  {
    id: 'top-production-days',
    label: 'Top 5 highest production days',
    question: 'Show me the top 5 highest production days in January 2025 with tonnage and cubic meters',
    expectedRoute: 'sql'
  },
  {
    id: 'shift-performance',
    label: 'Shift performance comparison',
    question: 'Compare total and average production by shift for January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'top-performing-tippers',
    label: 'Top performing tippers',
    question: 'Which tippers made the most trips in January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'excavator-utilization',
    label: 'Excavator utilization analysis',
    question: 'Show excavator performance with total trips and how many tippers each worked with in January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'route-analysis',
    label: 'Most used routes and faces',
    question: 'What are the most used routes or faces in January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'production-trends',
    label: 'Production trends with average',
    question: 'Plot QTY TON production for January 2025 with average line overlay',
    expectedRoute: 'sql'
  },
  {
    id: 'shift-visualization',
    label: 'Shift-wise production visualization',
    question: 'Show shift A, B, C production with different colors for January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'tipper-excavator-pairs',
    label: 'Best tipper-excavator combinations',
    question: 'Show the top tipper and excavator combinations by total trips in January 2025',
    expectedRoute: 'sql'
  },
  {
    id: 'daily-production-breakdown',
    label: 'Production with equipment details',
    question: 'Show production on January 15, 2025 shift A and which tippers contributed',
    expectedRoute: 'sql'
  },
  {
    id: 'monthly-summary',
    label: 'Complete January summary',
    question: 'Give me a complete summary of January 2025 production including total tonnage, trips, and equipment utilization',
    expectedRoute: 'sql'
  }
];


export const RAG_PRESETS = {
  precise: {
    row_chunk_size: 5,
    chunk_overlap: 5,
    top_k: 5,
    label: 'Precise Q&A'
  },
  balanced: {
    row_chunk_size: 10,
    chunk_overlap: 0,
    top_k: 5,
    label: 'Balanced (Default)'
  },
  fast: {
    row_chunk_size: 30,
    chunk_overlap: 0,
    top_k: 3,
    label: 'Fast Skim'
  },
  thorough: {
    row_chunk_size: 10,
    chunk_overlap: 10,
    top_k: 8,
    label: 'Thorough Review'
  }
};
