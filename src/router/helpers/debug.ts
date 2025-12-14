/**
 * Debug logging helpers for router
 */

const DEBUG_ENABLED = process.env.NODE_ENV === 'development' || (typeof import.meta !== 'undefined' && import.meta.env?.DEV);

export function debugBranch(ruleName: string, params?: any): void {
  if (!DEBUG_ENABLED) return;
  console.log(`[Router] Branch: ${ruleName}`, params || '');
}

export function debugSQL(type: string, sql: string): void {
  if (!DEBUG_ENABLED) return;
  console.log(`[Router] SQL ${type}:`, sql.substring(0, 100) + (sql.length > 100 ? '...' : ''));
}

export function debugIntent(intentInfo: any): void {
  if (!DEBUG_ENABLED) return;
  console.log('[Router] Intent:', {
    intent: intentInfo.intent,
    confidence: intentInfo.confidence,
    keywords: intentInfo.matched_keywords,
  });
}

export function debugDecision(decision: any): void {
  if (!DEBUG_ENABLED) return;
  console.log('[Router] Decision:', {
    task: decision.task,
    confidence: decision.confidence,
    reason: decision.reason,
    source: decision.route_source,
  });
}

export function debugParameters(params: any): void {
  if (!DEBUG_ENABLED) return;
  console.log('[Router] Parameters:', params);
}
