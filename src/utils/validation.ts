export function validateSQLQuery(query: string): { valid: boolean; error?: string; sanitized?: string } {
  const normalized = query.trim().toUpperCase();

  if (!normalized.startsWith('SELECT')) {
    return {
      valid: false,
      error: 'Only SELECT queries are allowed'
    };
  }

  const disallowedKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE'
  ];

  for (const keyword of disallowedKeywords) {
    if (normalized.includes(keyword)) {
      return {
        valid: false,
        error: `Keyword ${keyword} is not allowed`
      };
    }
  }

  if (normalized.includes('CROSS JOIN')) {
    return {
      valid: false,
      error: 'CROSS JOIN is not allowed due to performance concerns'
    };
  }

  let sanitized = query.trim();
  sanitized = sanitized.replace(/;+\s*$/g, '');

  if (!sanitized.toUpperCase().includes('LIMIT')) {
    sanitized += ' LIMIT 10000';
  }

  return {
    valid: true,
    sanitized
  };
}

export function validateFileType(filename: string): { valid: boolean; type?: string; error?: string } {
  const ext = filename.split('.').pop()?.toUpperCase();

  const validTypes = ['CSV', 'XLSX', 'PDF', 'DOCX'];

  if (!ext || !validTypes.includes(ext)) {
    return {
      valid: false,
      error: 'Only CSV, XLSX, PDF, and DOCX files are supported'
    };
  }

  return {
    valid: true,
    type: ext
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateCost(tokens: number, model: string = 'gpt-3.5-turbo'): number {
  const costs: Record<string, number> = {
    'gpt-3.5-turbo': 0.0015 / 1000,
    'gpt-4': 0.03 / 1000,
    'text-embedding-ada-002': 0.0001 / 1000
  };

  return tokens * (costs[model] || costs['gpt-3.5-turbo']);
}
