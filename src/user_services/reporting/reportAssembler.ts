import type { ReportSession } from './reportTypes';

// Build a lightweight markdown representation of the session
export function buildMarkdown(session: ReportSession): string {
  console.log('[buildMarkdown] Input session:', JSON.stringify(session));
  
  if (!session) {
    console.error('[buildMarkdown] Session is null/undefined');
    return '# Empty Report\n\nNo session data available.';
  }

  const lines: string[] = [];
  lines.push(`# Session Report`);
  lines.push(`- Session ID: ${session.sessionId || 'N/A'}`);
  if (session.userId) lines.push(`- User ID: ${session.userId}`);
  lines.push(`- Started: ${session.startedAt || 'N/A'}`);
  if (session.endedAt) lines.push(`- Ended: ${session.endedAt}`);
  lines.push('');

  // Defensive check for turns array
  const turns = session.turns || [];
  console.log('[buildMarkdown] Turns array:', turns.length, 'items');
  
  if (turns.length === 0) {
    lines.push('*No conversation turns recorded*');
    lines.push('');
    return lines.join('\n');
  }

  turns.forEach((t, idx) => {
    lines.push(`## Turn ${idx + 1}`);
    lines.push(`**Question:** ${t.question}`);
    lines.push(`**Answer:** ${t.answer}`);
    lines.push(`**Route:** ${t.route}${t.confidence != null ? ` (conf: ${t.confidence.toFixed(2)})` : ''}`);
    if (t.sql) lines.push(`**SQL:** \`${t.sql}\``);
    if (t.citations?.length) lines.push(`**Citations:** ${t.citations.length}`);
    if (t.charts?.length) {
      lines.push('**Charts:**');
      t.charts.forEach((c, i) => {
        lines.push(`- ${i + 1}. ${c.title ?? c.chartType ?? 'chart'}${c.svgDataUrl ? ` [svg](${c.svgDataUrl})` : ''}`);
      });
    }
    lines.push('');
  });

  return lines.join('\n');
}

// Basic JSON representation (already the session object) but exported for symmetry
export function buildJSON(session: ReportSession): string {
  return JSON.stringify(session, null, 2);
}
