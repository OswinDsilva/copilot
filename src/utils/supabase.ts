import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function getEnvVar(key: string): string | undefined {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return import.meta.env[key];
    }
  } catch {}
  return process.env[key];
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
    const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Missing Supabase credentials`);
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey);
  }

  return supabaseInstance;
}

export function sanitizeRagParams(p: any) {
  const toInt = (v: any, d: number) => Number.isFinite(+v) ? Math.trunc(+v) : d;

  let row = toInt(p?.row_chunk_size, 10);
  row = Math.min(50, Math.max(1, row));

  let ov = toInt(p?.chunk_overlap, 0);
  ov = Math.min(50, Math.max(0, ov));

  let k = toInt(p?.top_k, 5);
  k = Math.min(10, Math.max(1, k));

  return {
    row_chunk_size: row,
    chunk_overlap: ov,
    top_k: k
  };
}

export function formatTimestampIST(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(d);
}

export function generateNamespace(filename: string): string {
  const timestamp = Date.now();
  const clean = filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return `${clean}_${timestamp}`;
}

export function hashQuery(query: string): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
