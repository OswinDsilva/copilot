import type { ReportSession } from './reportTypes';
import type { RAGSettings } from '../../types';

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 2500;
const TEMPERATURE = 0.3;

function buildPrompt(session: ReportSession): { system: string; user: string } {
  const system = [
    'You are a mining operations reporting assistant.',
    'Create a comprehensive summary report of the current chat session.',
    'The report must include:',
    '1. Session Overview: Brief context of the session.',
    '2. Chat History Summary: A concise list of user queries and the system outputs/answers.',
    '3. Key Metrics: Any production numbers, equipment stats, or efficiency figures discussed.',
    '4. Insights: Strategic observations or patterns found in the data.',
    '5. Next Actions: Recommended steps based on the analysis.',
    'Format the output using Markdown. Use bolding for key terms, bullet points for lists, and headers for sections.',
    'IMPORTANT: Use proper Markdown bullet points (e.g., "- Item") for all lists. Do not use numbered lists unless sequential steps are required.',
    'Ensure the layout is clean and easy to read.',
    'Keep it professional and factual.'
  ].join(' ');

  const user = [
    'Conversation session to summarize:',
    JSON.stringify(session)
  ].join('\n');

  return { system, user };
}

export async function summarizeReport(session: ReportSession, settings?: RAGSettings): Promise<string> {
  const apiKey = settings?.openai_api_key || import.meta.env.VITE_OPENAI_API_KEY || '';
  if (!apiKey) {
    throw new Error('OpenAI API key missing. Please add it in Settings.');
  }

  const { system, user } = buildPrompt(session);

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from OpenAI API');
  }

  return content.trim();
}
