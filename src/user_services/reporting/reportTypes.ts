// Basic reporting types for assembling a session report
export type ChartExport = {
  id: string;
  title?: string;
  chartType?: string;
  svgDataUrl?: string;
  pngDataUrl?: string;
};

export type ReportTurn = {
  id: string;
  question: string;
  answer: string;
  route: 'sql' | 'rag' | 'optimize';
  timestamp: string;
  confidence?: number;
  sql?: string;
  citations?: any[];
  charts?: ChartExport[];
};

export type ReportSession = {
  sessionId: string;
  userId?: string;
  startedAt: string;
  endedAt?: string;
  turns: ReportTurn[];
};

export type DeliveryTarget = {
  to: string;
  channel: 'email' | 'whatsapp';
};
