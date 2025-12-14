import { useState } from 'react';
import { RouteType } from '../types';
import ResultsTable from './ResultsTable';

interface AnswerFormatterProps {
  answer: string;
  routeTaken: RouteType;
  sqlQuery?: string | null;
  question?: string;
}

function formatMarkdownText(text: string): JSX.Element {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let currentList: string[] = [];
  let currentListType: 'ul' | 'ol' | null = null;

  const flushList = () => {
    if (currentList.length > 0 && currentListType) {
      const ListTag = currentListType === 'ul' ? 'ul' : 'ol';
      elements.push(
        <ListTag key={elements.length} className="ml-6 mb-4 space-y-1">
          {currentList.map((item, idx) => {
            // Process bold text in list items
            const parts = item.split(/\*\*(.*?)\*\*/g);
            return (
              <li key={idx} className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {parts.map((part, i) =>
                  i % 2 === 1 ? <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{part}</strong> : part
                )}
              </li>
            );
          })}
        </ListTag>
      );
      currentList = [];
      currentListType = null;
    }
  };

  const processBoldText = (text: string) => {
    // First split by bold (**), then process each part for italics (*)
    const boldParts = text.split(/\*\*(.*?)\*\*/g);
    return boldParts.map((part, i) => {
      if (i % 2 === 1) {
        // This is bold text
        return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{part}</strong>;
      } else {
        // Check for italics in non-bold text
        const italicParts = part.split(/\*(.*?)\*/g);
        return italicParts.map((iPart, j) =>
          j % 2 === 1 ? <em key={`${i}-${j}`} className="italic text-slate-800 dark:text-slate-200">{iPart}</em> : iPart
        );
      }
    });
  };

  lines.forEach((line, idx) => {
    // Check for headers (###, ##, #)
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const headerText = headerMatch[2];

      if (level === 1) {
        elements.push(<h1 key={idx} className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4 mt-6">{headerText}</h1>);
      } else if (level === 2) {
        elements.push(<h2 key={idx} className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3 mt-5">{headerText}</h2>);
      } else if (level === 3) {
        elements.push(<h3 key={idx} className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2 mt-4">{headerText}</h3>);
      } else {
        elements.push(<h4 key={idx} className="text-base font-semibold text-slate-600 dark:text-slate-400 mb-2 mt-3">{headerText}</h4>);
      }
    } else if (line.match(/^\s*[-*]\s+/)) {
      const text = line.replace(/^\s*[-*]\s+/, '');
      if (currentListType !== 'ul') {
        flushList();
        currentListType = 'ul';
      }
      currentList.push(text);
    } else if (line.match(/^\s*\d+\.\s+/)) {
      const text = line.replace(/^\s*\d+\.\s+/, '');
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      currentList.push(text);
    } else if (line.trim() === '') {
      flushList();
      elements.push(<div key={idx} className="h-2" />);
    } else if (line.trim()) {
      flushList();
      elements.push(
        <p key={idx} className="text-slate-700 dark:text-slate-300 mb-2 leading-relaxed">
          {processBoldText(line)}
        </p>
      );
    }
  });

  flushList();

  return <div className="space-y-1">{elements}</div>;
}

// Helper to detect and parse structured data rows
function parseStructuredRows(text: string): { rows: Record<string, any>[], remainingText: string } | null {
  const lines = text.split('\n');
  const rows: Record<string, any>[] = [];
  let currentRow: Record<string, any> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      if (Object.keys(currentRow).length > 0) {
        rows.push({ ...currentRow });
        currentRow = {};
      }
      continue;
    }
    
    // Capture introductory text
    if (line.match(/^(Based on|Here are|The following|first \d+ rows)/i) && rows.length === 0) {
      continue;
    }
    
    // Skip source citations and metadata
    if (line.match(/^\[Source \d+\]|^Route:|^Latency:|^Intent:/i)) {
      continue;
    }
    
    // Pattern 1: Comma-separated key-value pairs (all on one line)
    // Example: "Customer ID: 1, Age: 55, Gender: Male, Item Purchased: Blouse"
    const commaKvMatches = line.match(/(\w[\w\s()]*?):\s*([^,]+?)(?:,|$)/g);
    if (commaKvMatches && commaKvMatches.length >= 3) {
      // Start a new row
      if (Object.keys(currentRow).length > 0) {
        rows.push({ ...currentRow });
        currentRow = {};
      }
      
      commaKvMatches.forEach(match => {
        const colonIndex = match.indexOf(':');
        const field = match.substring(0, colonIndex).trim();
        const value = match.substring(colonIndex + 1).replace(/,$/, '').trim();
        if (field && value) {
          currentRow[field] = value;
        }
      });
      continue;
    }
    
    // Pattern 2: Single field per line (multi-line format)
    // Example: "Customer ID: 36" followed by "Age: 54"
    const singleKvMatch = line.match(/^([\w\s()_-]+?):\s*(.+)$/);
    if (singleKvMatch) {
      const field = singleKvMatch[1].trim();
      const value = singleKvMatch[2].trim();
      
      // Detect row boundaries: these fields indicate start of new record
      const startingFields = ['customer id', 'customer_id', 'track_id', 'track id', 'textid', 'text id', 'user id', 'id', 'row', 'record number'];
      const isStartField = startingFields.some(sf => field.toLowerCase() === sf || field.toLowerCase().startsWith(sf));
      
      // If we see a starting field AND we already have a complete row, save it
      if (isStartField && Object.keys(currentRow).length >= 5) {
        rows.push({ ...currentRow });
        currentRow = {};
      }
      
      currentRow[field] = value;
      continue;
    }
  }
  
  // Push final row if exists and has enough fields
  if (Object.keys(currentRow).length >= 5) {
    rows.push({ ...currentRow });
  }
  
  // Must have at least 1 row with 5+ fields to be considered structured data
  if (rows.length >= 1 && rows.every(r => Object.keys(r).length >= 5)) {
    // Calculate where data ends (last non-empty line with data)
    let lastDataIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() && lines[i].match(/:/)) {
        lastDataIndex = i + 1;
        break;
      }
    }
    
    const remainingText = lines.slice(lastDataIndex).join('\n');
    return { rows, remainingText: remainingText.trim() };
  }
  
  return null;
}

export default function AnswerFormatter({ answer, routeTaken, sqlQuery, question }: AnswerFormatterProps) {
  const [showSQL, setShowSQL] = useState(false);

  // Helper to render content with potential JSON tables
  const renderContent = (text: string) => {
    // First check for <<<JSON_TABLE_DATA>>> markers
    const jsonTableRegex = /<<<JSON_TABLE_DATA>>>([\s\S]*?)<<<JSON_TABLE_DATA>>>/g;
    const hasJsonTableMarkers = jsonTableRegex.test(text);
    
    if (hasJsonTableMarkers) {
      const parts: JSX.Element[] = [];
      let lastIndex = 0;
      const regex = /<<<JSON_TABLE_DATA>>>([\s\S]*?)<<<JSON_TABLE_DATA>>>/g;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        // Add text before the table
        if (match.index > lastIndex) {
          const textBefore = text.substring(lastIndex, match.index);
          if (textBefore.trim()) {
            parts.push(<div key={`text-${lastIndex}`}>{formatMarkdownText(textBefore)}</div>);
          }
        }
        
        // Add the table
        try {
          const jsonData = JSON.parse(match[1].trim());
          
          // Render table with ChartAgent integration
          parts.push(<ResultsTable key={`table-${match.index}`} data={jsonData} useChartAgent={true} userQuery={question} />);
        } catch (e) {
          console.error('Failed to parse JSON table data:', e);
          parts.push(<pre key={`error-${match.index}`} className="bg-slate-100 p-2 rounded overflow-x-auto text-sm">{match[1]}</pre>);
        }
        
        lastIndex = regex.lastIndex;
      }
      
      // Add remaining text after last table
      if (lastIndex < text.length) {
        const textAfter = text.substring(lastIndex);
        if (textAfter.trim()) {
          parts.push(<div key={`text-${lastIndex}`}>{formatMarkdownText(textAfter)}</div>);
        }
      }
      
      return <div>{parts}</div>;
    }
    
    // Check for structured row data (RAG responses with field: value patterns)
    const structuredData = parseStructuredRows(text);
    console.log('[AnswerFormatter] Structured data parsed:', structuredData);
    
    if (structuredData && structuredData.rows.length > 0) {
      console.log('[AnswerFormatter] Rendering', structuredData.rows.length, 'rows as table');
      return (
        <div>
          {text.split('\n')[0]?.match(/^(Based on|Here are|The following)/i) && (
            <p className="text-slate-700 dark:text-slate-300 mb-3">{text.split('\n')[0]}</p>
          )}
          <ResultsTable data={structuredData.rows} useChartAgent={true} userQuery={question} />
          {structuredData.remainingText.trim() && (
            <div className="mt-4">{formatMarkdownText(structuredData.remainingText)}</div>
          )}
        </div>
      );
    }
    
    // Fallback to code block parsing
    const parts = text.split(/(```json[\s\S]*?```)/g);
    
    return (
      <div>
        {parts.map((part, idx) => {
          if (part.startsWith('```json')) {
            try {
              const jsonStr = part.replace(/^```json\s*/, '').replace(/\s*```$/, '');
              const data = JSON.parse(jsonStr);
              return <ResultsTable key={idx} data={data} useChartAgent={true} userQuery={question} />;
            } catch (e) {
              return <pre key={idx} className="bg-slate-100 p-2 rounded overflow-x-auto text-sm">{part}</pre>;
            }
          } else if (part.trim()) {
            return <div key={idx}>{formatMarkdownText(part)}</div>;
          }
          return null;
        })}
      </div>
    );
  };

  // Small SQL panel to show the exact SQL executed when available
  const SQLPanel = sqlQuery ? (
    <div className="mb-3 p-3 bg-slate-50 dark:bg-mining-surface border border-slate-200 dark:border-mining-border rounded">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600 dark:text-slate-400">Exact SQL executed</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSQL(s => !s)}
            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300"
          >
            {showSQL ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(sqlQuery)}
            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300"
          >
            Copy
          </button>
        </div>
      </div>
      {showSQL && (
        <pre className="text-xs text-slate-800 dark:text-mining-text-secondary bg-white dark:bg-mining-bg p-2 rounded overflow-x-auto">{sqlQuery}</pre>
      )}
    </div>
  ) : null;

  if (routeTaken !== 'sql') {
    // Show SQL panel (if available) above markdown answers so users can see the underlying query even for non-sql routes
    return (
      <div>
        {SQLPanel}
        {renderContent(answer)}
      </div>
    );
  }

  const successMatch = answer.match(/Query executed successfully\. Found (\d+) results?\.\s*([\s\S]*)/);

  if (!successMatch) {
    // Fallback to standard rendering if regex doesn't match
    // But also try to parse JSON blocks if present (e.g. if SQL route returned mixed content)
    return (
      <div>
        {SQLPanel}
        {renderContent(answer)}
      </div>
    );
  }

  const jsonStr = successMatch[2].trim();

  try {
    const data = JSON.parse(jsonStr);

    if (!Array.isArray(data) || data.length === 0) {
      return (
        <div>
          {SQLPanel}
          <p className="text-slate-700 dark:text-slate-300 font-medium mb-2">Query executed successfully.</p>
          <p className="text-slate-500 dark:text-slate-400 italic">No results found.</p>
        </div>
      );
    }

    return (
      <div>
        {SQLPanel}
        <ResultsTable data={data} useChartAgent={true} userQuery={question} />
      </div>
    );
  } catch (error) {
    return (
      <div>
        {SQLPanel}
        <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">{answer}</p>
      </div>
    );
  }
}
