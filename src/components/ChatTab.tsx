import { useState, useEffect, useRef } from 'react';
import { Send, AlertCircle, Trash2, FileText, Download } from 'lucide-react';
import AnswerFormatter from './AnswerFormatter';
import type { ChatMessage } from '../types';

interface ChatTabProps {
  onSendMessage: (message: string, route?: 'sql' | 'rag') => void;
  onClearHistory: () => void;
  onSummarize: () => void;
  onExportLog: () => void;
  isLoading: boolean;
  chatHistory: ChatMessage[];
}

export default function ChatTab({ onSendMessage, onClearHistory, onSummarize, onExportLog, isLoading, chatHistory }: ChatTabProps) {
  const [input, setInput] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [forceRAG, setForceRAG] = useState(false);
  const [showSqlMap, setShowSqlMap] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  // Auto-scroll to bottom when chat history or loading state changes
  useEffect(() => {
    if (chatHistory.length > 0 || isLoading) {
      if (isInitialLoad.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        isInitialLoad.current = false;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [chatHistory, isLoading]);

  // derive last response latency from chat history (ms)
  const lastLatency = chatHistory && chatHistory.length > 0 ? chatHistory[chatHistory.length - 1].latency_ms : undefined;
  const formattedLatency = lastLatency !== undefined && lastLatency !== null
    ? (lastLatency >= 1000 ? `${(lastLatency / 1000).toFixed(2)}s` : `${lastLatency}ms`)
    : '—';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const question = input.trim();
    const routeOverride = forceRAG ? 'rag' : undefined;
    console.log('[ChatTab] Submitting question:', question, 'Force RAG:', forceRAG, 'Route Override:', routeOverride);
    setInput('');
    onSendMessage(question, routeOverride);
  };

  const handleManualOverride = (route: 'sql' | 'rag') => {
    onSendMessage(pendingQuestion, route);
    setShowOverride(false);
    setPendingQuestion('');
  };

  const handleConfirmDelete = () => {
    onClearHistory();
    setShowConfirmDelete(false);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-mining-bg">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-mining-border bg-white dark:bg-mining-surface">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Chat</h2>
        <div className="flex items-center gap-2">
          {chatHistory.length > 0 && (
            <>
              <button
                onClick={onSummarize}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                disabled={isLoading}
              >
                <FileText className="w-4 h-4" />
                Summarise
              </button>
              <button
                onClick={onExportLog}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                disabled={isLoading}
              >
                <Download className="w-4 h-4" />
                Export Log
              </button>
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                disabled={isLoading}
              >
                <Trash2 className="w-4 h-4" />
                Clear History
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-mining-bg">
        {chatHistory.length === 0 && (
          <div className="text-center text-slate-500 dark:text-mining-text-secondary mt-12">
            <p className="text-lg">Ask a question about mining operations</p>
            <p className="text-sm mt-2">I can query the database or search through your documents</p>
          </div>
        )}

        {chatHistory.map((msg) => (
          <div key={msg.id}>
            <div className="flex justify-end mb-4">
              <div className="max-w-3xl bg-blue-600 dark:bg-blue-700 text-white rounded-lg p-4 shadow-sm">
                <p className="text-white">{msg.question}</p>
              </div>
            </div>
            <div className="flex justify-start mb-4">
              <div className="w-full max-w-6xl bg-white dark:bg-mining-surface border border-slate-200 dark:border-mining-border rounded-lg p-4 shadow-sm">
                <AnswerFormatter answer={msg.answer} routeTaken={msg.route_taken} sqlQuery={msg.sql_query} question={msg.question} />

                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
                  <div>Route: {msg.route_source === 'llm' ? 'LLM' : msg.route_source === 'deterministic' ? 'Rules' : 'Unknown'}</div>
                  <div>Latency: {msg.latency_ms !== undefined && msg.latency_ms !== null ? (msg.latency_ms >= 1000 ? `${(msg.latency_ms / 1000).toFixed(2)}s` : `${msg.latency_ms}ms`) : '—'}</div>
                  <div>Intent: {msg.detected_intent || '—'}{msg.intent_confidence ? ` (${msg.intent_confidence})` : ''}</div>
                  <div>Template: {msg.template_used || '—'}</div>
                  {msg.sql_query && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSqlMap(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                        className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                      >
                        {showSqlMap[msg.id] ? 'Hide SQL' : 'Show SQL'}
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(msg.sql_query || '')}
                        className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                      >
                        Copy SQL
                      </button>
                    </div>
                  )}
                </div>

                {msg.sql_query && showSqlMap[msg.id] && (
                  <pre className="mt-2 text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-x-auto">{msg.sql_query}</pre>
                )}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-mining-border">
                    <p className="text-xs font-medium text-slate-700 dark:text-mining-text mb-2">Citations:</p>
                    {msg.citations.map((c: any, i: number) => (
                      <div key={i} className="text-xs text-slate-600 dark:text-mining-text-secondary mb-1">
                        <span className="font-medium">[{i + 1}]</span> {c.file_name} {c.sheet && `(${c.sheet})`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-mining-surface border border-slate-200 dark:border-mining-border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 dark:border-mining-blue border-t-transparent rounded-full"></div>
                <span className="text-slate-600 dark:text-mining-text-secondary">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {showConfirmDelete && (
        <div className="border-t border-slate-200 dark:border-mining-border bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">Clear Chat History</p>
              <p className="text-sm text-slate-600 dark:text-mining-text-secondary mt-1">Are you sure you want to delete all chat messages? This action cannot be undone.</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  Yes, Delete All
                </button>
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 dark:bg-mining-bg dark:text-mining-text dark:hover:bg-mining-surface rounded-lg text-sm hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOverride && (
        <div className="border-t border-slate-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">Low confidence routing</p>
              <p className="text-sm text-slate-600 dark:text-mining-text-secondary mt-1">Please confirm how you'd like me to answer this question:</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleManualOverride('sql')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  Use SQL Database
                </button>
                <button
                  onClick={() => handleManualOverride('rag')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Search Documents
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-200 dark:border-mining-border p-4 bg-white dark:bg-mining-surface">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about mining operations..."
              className="flex-1 px-4 py-3 border border-slate-300 dark:border-mining-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 bg-white dark:bg-mining-bg text-slate-900 dark:text-mining-text placeholder:text-slate-400 dark:placeholder:text-mining-text-secondary"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={forceRAG}
              onChange={(e) => setForceRAG(e.target.checked)}
              className="w-4 h-4 text-blue-600 dark:text-blue-500 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <span>Force RAG (search documents instead of SQL database)</span>
            <span className="text-xs text-slate-500 dark:text-mining-text-secondary ml-2">Last response: {formattedLatency}</span>
          </label>
        </form>
      </div>
    </div>
  );
}
