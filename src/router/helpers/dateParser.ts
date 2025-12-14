/**
 * Date Parser Utility
 * 
 * Handles complex date parsing scenarios including:
 * - Quarters with years (Q1 2024, first quarter of 2024)
 * - Relative dates (last month, this year, last 30 days)
 * - Date ranges with natural language (from January to March 2024)
 * - Edge cases (year boundaries, quarter boundaries)
 */

export interface ParsedDate {
  type: 'single' | 'range' | 'quarter' | 'month' | 'year' | 'relative';
  startDate?: string;  // ISO format YYYY-MM-DD
  endDate?: string;    // ISO format YYYY-MM-DD
  year?: number;
  quarter?: number;
  month?: number;
  monthName?: string;
  relativePeriod?: string;
  rawText?: string;
}

/**
 * Get the current date (utility for testing and consistency)
 */
export function getCurrentDate(): Date {
  return new Date('2025-11-14'); // Locked to user's current date
}

/**
 * Parse quarter expressions with optional year
 * Examples: "Q1 2024", "first quarter of 2024", "Q3"
 */
export function parseQuarter(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  
  // Pattern 1: Q1, Q2, Q3, Q4 with optional year
  const qNumMatch = lowerText.match(/\bq([1-4])(?:\s+(?:of\s+)?(\d{4}))?\b/i);
  if (qNumMatch) {
    const quarter = parseInt(qNumMatch[1], 10);
    const year = qNumMatch[2] ? parseInt(qNumMatch[2], 10) : getCurrentDate().getFullYear();
    
    return {
      type: 'quarter',
      quarter,
      year,
      ...getQuarterDateRange(quarter, year),
      rawText: qNumMatch[0]
    };
  }
  
  // Pattern 2: first/second/third/fourth quarter with optional year
  const qWordMatch = lowerText.match(/\b(first|second|third|fourth)\s+quarter(?:\s+(?:of\s+)?(\d{4}))?\b/i);
  if (qWordMatch) {
    const quarterMap: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
    const quarter = quarterMap[qWordMatch[1].toLowerCase()];
    const year = qWordMatch[2] ? parseInt(qWordMatch[2], 10) : getCurrentDate().getFullYear();
    
    return {
      type: 'quarter',
      quarter,
      year,
      ...getQuarterDateRange(quarter, year),
      rawText: qWordMatch[0]
    };
  }
  
  return null;
}

/**
 * Get date range for a specific quarter
 */
export function getQuarterDateRange(quarter: number, year: number): { startDate: string; endDate: string } {
  const quarterMonths = {
    1: { start: 1, end: 3 },
    2: { start: 4, end: 6 },
    3: { start: 7, end: 9 },
    4: { start: 10, end: 12 }
  };
  
  const { start, end } = quarterMonths[quarter as keyof typeof quarterMonths];
  
  // Start date: first day of first month
  const startDate = `${year}-${String(start).padStart(2, '0')}-01`;
  
  // End date: last day of last month
  const lastDay = new Date(year, end, 0).getDate(); // Day 0 = last day of previous month
  const endDate = `${year}-${String(end).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  return { startDate, endDate };
}

/**
 * Parse relative date expressions
 * Examples: "last month", "this year", "last 30 days", "last week"
 */
export function parseRelativeDate(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  const today = getCurrentDate();
  
  // Today
  if (lowerText.includes('today')) {
    const dateStr = today.toISOString().slice(0, 10);
    return {
      type: 'single',
      startDate: dateStr,
      endDate: dateStr,
      relativePeriod: 'today'
    };
  }
  
  // Yesterday
  if (lowerText.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    return {
      type: 'single',
      startDate: dateStr,
      endDate: dateStr,
      relativePeriod: 'yesterday'
    };
  }
  
  // This week
  if (lowerText.includes('this week')) {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
    
    return {
      type: 'range',
      startDate: startOfWeek.toISOString().slice(0, 10),
      endDate: endOfWeek.toISOString().slice(0, 10),
      relativePeriod: 'this_week'
    };
  }
  
  // Last week
  if (lowerText.includes('last week')) {
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    
    return {
      type: 'range',
      startDate: startOfLastWeek.toISOString().slice(0, 10),
      endDate: endOfLastWeek.toISOString().slice(0, 10),
      relativePeriod: 'last_week'
    };
  }
  
  // This month
  if (lowerText.includes('this month')) {
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    
    return {
      type: 'range',
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      relativePeriod: 'this_month',
      year,
      month
    };
  }
  
  // Last month
  if (lowerText.includes('last month')) {
    const lastMonthDate = new Date(today);
    lastMonthDate.setMonth(today.getMonth() - 1);
    const year = lastMonthDate.getFullYear();
    const month = lastMonthDate.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    
    return {
      type: 'range',
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      relativePeriod: 'last_month',
      year,
      month
    };
  }
  
  // This year
  if (lowerText.includes('this year')) {
    const year = today.getFullYear();
    return {
      type: 'year',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      relativePeriod: 'this_year',
      year
    };
  }
  
  // Last year
  if (lowerText.includes('last year')) {
    const year = today.getFullYear() - 1;
    return {
      type: 'year',
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      relativePeriod: 'last_year',
      year
    };
  }
  
  // Last N days/weeks/months/years
  const lastNMatch = lowerText.match(/(?:last|past|previous)\s+(\d+)\s+(day|week|month|year)s?/i);
  if (lastNMatch) {
    const num = parseInt(lastNMatch[1], 10);
    const unit = lastNMatch[2].toLowerCase();
    
    const endDate = new Date(today);
    const startDate = new Date(today);
    
    switch (unit) {
      case 'day':
        startDate.setDate(today.getDate() - num);
        break;
      case 'week':
        startDate.setDate(today.getDate() - (num * 7));
        break;
      case 'month':
        startDate.setMonth(today.getMonth() - num);
        break;
      case 'year':
        startDate.setFullYear(today.getFullYear() - num);
        break;
    }
    
    return {
      type: 'range',
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      relativePeriod: `last_${num}_${unit}s`
    };
  }
  
  return null;
}

/**
 * Parse month names with optional year
 * Examples: "January", "January 2024", "Jan 2024", "january, 2024"
 */
/**
 * Parse specific date like "January 15, 2025" or "15 January 2025"
 */
export function parseSpecificDate(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  for (let i = 0; i < months.length; i++) {
    const monthName = months[i];
    const monthAbbr = monthName.slice(0, 3);
    
    // Pattern 1: "January 15, 2025" or "Jan 15, 2025"
    const pattern1 = new RegExp(`\\b(${monthName}|${monthAbbr})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i');
    const match1 = lowerText.match(pattern1);
    
    if (match1) {
      const month = i + 1;
      const day = parseInt(match1[2], 10);
      const year = match1[3] ? parseInt(match1[3], 10) : getCurrentDate().getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      return {
        type: 'single',
        startDate: dateStr,
        endDate: dateStr,
        month,
        monthName,
        year,
        rawText: match1[0]
      };
    }
    
    // Pattern 2: "15 January 2025" or "15 Jan 2025"
    const pattern2 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthName}|${monthAbbr})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i');
    const match2 = lowerText.match(pattern2);
    
    if (match2) {
      const day = parseInt(match2[1], 10);
      const month = i + 1;
      const year = match2[3] ? parseInt(match2[3], 10) : getCurrentDate().getFullYear();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      return {
        type: 'single',
        startDate: dateStr,
        endDate: dateStr,
        month,
        monthName,
        year,
        rawText: match2[0]
      };
    }
  }
  
  return null;
}

export function parseMonth(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  for (let i = 0; i < months.length; i++) {
    const monthName = months[i];
    const monthAbbr = monthName.slice(0, 3);
    
    // Check for full month name or abbreviation
    const monthRegex = new RegExp(`\\b(${monthName}|${monthAbbr})(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i');
    const match = lowerText.match(monthRegex);
    
    if (match) {
      const month = i + 1;
      const year = match[2] ? parseInt(match[2], 10) : getCurrentDate().getFullYear();
      const lastDay = new Date(year, month, 0).getDate();
      
      return {
        type: 'month',
        month,
        monthName,
        year,
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        rawText: match[0]
      };
    }
  }
  
  return null;
}

/**
 * Parse explicit date ranges
 * Examples: "from January to March 2024", "between 2024-01-01 and 2024-03-31", "january 12th to january 24th"
 */
export function parseDateRange(text: string): ParsedDate | null {
  const lowerText = text.toLowerCase();
  
  // Special pattern for day-to-day within same month: "january 12th to january 24th"
  const monthNames = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
  const dayToDayPattern = new RegExp(
    `(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+to\\s+(?:(${monthNames})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
    'i'
  );
  
  const dayMatch = lowerText.match(dayToDayPattern);
  if (dayMatch) {
    const monthNameMap: Record<string, number> = {
      'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
      'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6,
      'july': 7, 'jul': 7, 'august': 8, 'aug': 8, 'september': 9, 'sep': 9,
      'october': 10, 'oct': 10, 'november': 11, 'nov': 11, 'december': 12, 'dec': 12
    };
    
    const startMonthName = dayMatch[1].toLowerCase();
    const startDay = parseInt(dayMatch[2], 10);
    const endMonthName = dayMatch[3] ? dayMatch[3].toLowerCase() : startMonthName; // Use same month if not specified
    const endDay = parseInt(dayMatch[4], 10);
    const year = dayMatch[5] ? parseInt(dayMatch[5], 10) : getCurrentDate().getFullYear();
    
    const startMonth = monthNameMap[startMonthName];
    const endMonth = monthNameMap[endMonthName];
    
    if (startMonth && endMonth) {
      const startDate = `${year}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      
      return {
        type: 'range',
        startDate,
        endDate,
        year,
        rawText: dayMatch[0]
      };
    }
  }
  
  // Pattern: from X to Y (with various date formats)
  // Also supports "compare X to Y" and bare "X to Y" patterns
  const rangeMatch = lowerText.match(/(?:from|between|compare)?\s*(.+?)\s+(?:to|and)\s+(.+?)(?:\s|$)/i);
  if (!rangeMatch) return null;
  
  const startText = rangeMatch[1].trim();
  const endText = rangeMatch[2].trim();
  
  // Extract year if present in the full range text
  const yearInRange = parseYear(text);
  
  // Try to parse start and end as individual dates
  let startDate: string | undefined;
  let endDate: string | undefined;
  
  // Try ISO format (YYYY-MM-DD)
  const isoStart = startText.match(/(\d{4}-\d{2}-\d{2})/);
  const isoEnd = endText.match(/(\d{4}-\d{2}-\d{2})/);
  
  if (isoStart) startDate = isoStart[1];
  if (isoEnd) endDate = isoEnd[1];
  
  // Try month names (with year from range if available)
  if (!startDate) {
    const startWithYear = yearInRange ? `${startText} ${yearInRange}` : startText;
    const startMonth = parseMonth(startWithYear);
    if (startMonth) startDate = startMonth.startDate;
  }
  
  if (!endDate) {
    const endWithYear = yearInRange ? `${endText} ${yearInRange}` : endText;
    const endMonth = parseMonth(endWithYear);
    if (endMonth) endDate = endMonth.endDate;
  }
  
  if (startDate && endDate) {
    return {
      type: 'range',
      startDate,
      endDate,
      rawText: rangeMatch[0]
    };
  }
  
  return null;
}

/**
 * Parse year specification
 * Examples: "in 2024", "year 2024", "2024"
 * Returns the year as a number, not a full ParsedDate object
 */
export function parseYear(text: string): number | null {
  const lowerText = text.toLowerCase();
  
  // Pattern: explicit year (2000-2100)
  const yearMatch = lowerText.match(/\b(20\d{2}|2100)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    return year;
  }
  
  return null;
}

/**
 * Main parsing function - tries all patterns
 */
export function parseDate(text: string): ParsedDate | null {
  // Order matters: try most specific patterns first
  
  // 1. Try quarter (includes year)
  const quarter = parseQuarter(text);
  if (quarter) return quarter;
  
  // 2. Try date ranges
  const dateRange = parseDateRange(text);
  if (dateRange) return dateRange;
  
  // 3. Try specific date (e.g., "January 15, 2025") BEFORE month-only
  const specificDate = parseSpecificDate(text);
  if (specificDate) return specificDate;
  
  // 4. Try relative dates
  const relative = parseRelativeDate(text);
  if (relative) return relative;
  
  // 5. Try month (includes year)
  const month = parseMonth(text);
  if (month) return month;
  
  // 6. Try standalone year (convert to ParsedDate)
  const year = parseYear(text);
  if (year) {
    return {
      type: 'year',
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      rawText: String(year)
    };
  }
  
  return null;
}

/**
 * Convert ParsedDate to SQL WHERE clause
 */
export function dateToSQLFilter(parsed: ParsedDate, dateColumn: string = 'load_date'): string {
  if (!parsed.startDate && !parsed.endDate) {
    return '';
  }
  
  if (parsed.type === 'single') {
    return `${dateColumn} = '${parsed.startDate}'`;
  }
  
  if (parsed.startDate && parsed.endDate) {
    if (parsed.startDate === parsed.endDate) {
      return `${dateColumn} = '${parsed.startDate}'`;
    }
    return `${dateColumn} BETWEEN '${parsed.startDate}' AND '${parsed.endDate}'`;
  }
  
  if (parsed.startDate) {
    return `${dateColumn} >= '${parsed.startDate}'`;
  }
  
  if (parsed.endDate) {
    return `${dateColumn} <= '${parsed.endDate}'`;
  }
  
  return '';
}

/**
 * Format ParsedDate for human-readable display
 */
export function formatParsedDate(parsed: ParsedDate): string {
  if (parsed.type === 'quarter') {
    return `Q${parsed.quarter} ${parsed.year}`;
  }
  
  if (parsed.type === 'month') {
    return `${parsed.monthName} ${parsed.year}`;
  }
  
  if (parsed.type === 'year') {
    return `${parsed.year}`;
  }
  
  if (parsed.type === 'single') {
    return parsed.startDate || '';
  }
  
  if (parsed.type === 'range') {
    return `${parsed.startDate} to ${parsed.endDate}`;
  }
  
  if (parsed.relativePeriod) {
    return parsed.relativePeriod.replace(/_/g, ' ');
  }
  
  return '';
}
