import type { ChartExport, ReportSession, ReportTurn } from './reportTypes';

// Minimal in-memory store for the current session report
// Intended to be scoped per frontend session (reset on reload)
class ReportStore {
  private session: ReportSession | null = null;

  startSession(sessionId: string, userId?: string) {
    this.session = {
      sessionId,
      userId,
      startedAt: new Date().toISOString(),
      turns: [],
    };
    console.log('[ReportStore] startSession called with:', { sessionId, userId });
    console.log('[ReportStore] Session created:', JSON.stringify(this.session));
    return this.session;
  }

  endSession() {
    if (!this.session) {
      console.log('[ReportStore] endSession: no session found');
      return null;
    }
    this.session.endedAt = new Date().toISOString();
    console.log('[ReportStore] endSession: session being returned:', JSON.stringify(this.session));
    // Return a deep clone to prevent accidental mutations
    return JSON.parse(JSON.stringify(this.session));
  }

  addTurn(turn: ReportTurn) {
    if (!this.session) {
      console.error('[ReportStore] addTurn: no session, throwing error');
      throw new Error('Report session not started');
    }
    const turnWithCharts = { ...turn, charts: turn.charts ?? [] };
    this.session.turns.push(turnWithCharts);
    console.log('[ReportStore] Turn added. Total turns:', this.session.turns.length, 'Turn:', JSON.stringify(turnWithCharts));
    return this.session;
  }

  addChartExport(turnId: string, chart: ChartExport) {
    if (!this.session) throw new Error('Report session not started');
    const t = this.session.turns.find((x) => x.id === turnId);
    if (!t) throw new Error(`Turn ${turnId} not found`);
    if (!t.charts) t.charts = [];
    t.charts.push(chart);
    return this.session;
  }

  getSession() {
    return this.session;
  }

  reset() {
    console.log('[ReportStore] reset called');
    this.session = null;
  }
}

export const reportStore = new ReportStore();
