import { useState } from 'react';
import { History, Zap, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { CANNED_QUESTIONS } from '../types';
import type { ChatMessage } from '../types';

interface SidebarProps {
  chatHistory: ChatMessage[];
  onSelectHistory: (message: ChatMessage) => void;
  onCannedQuestion: (question: string) => void;
  activeTab: 'chat' | 'settings';
  onTabChange: (tab: 'chat' | 'settings') => void;
}

export default function Sidebar({ chatHistory, onSelectHistory, onCannedQuestion, activeTab, onTabChange }: SidebarProps) {
  const [isQuickQuestionsOpen, setIsQuickQuestionsOpen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);

  return (
    <div className="w-72 bg-slate-50 dark:bg-mining-surface border-r border-slate-200 dark:border-mining-border flex flex-col h-full">
      <div className="p-4 border-b border-slate-200 dark:border-mining-border">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-mining-text">Mining Co-Pilot</h2>
      </div>

      <div className="p-2 space-y-1">
        <button
          onClick={() => onTabChange('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'chat'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-mining-bg'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <button
            onClick={() => setIsQuickQuestionsOpen(!isQuickQuestionsOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 w-full hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            {isQuickQuestionsOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <Zap className="w-4 h-4" />
            <span>Quick Questions</span>
          </button>
          {isQuickQuestionsOpen && (
            <div className="space-y-2">
              {CANNED_QUESTIONS.map(q => (
                <button
                  key={q.id}
                  onClick={() => onCannedQuestion(q.question)}
                  className="w-full text-left px-3 py-2 text-sm bg-white dark:bg-mining-bg border border-slate-200 dark:border-mining-border text-slate-900 dark:text-mining-text rounded-lg hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-mining-border">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-3 w-full hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            {isHistoryOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <History className="w-4 h-4" />
            <span>Recent History</span>
          </button>
          {isHistoryOpen && (
            <div className="space-y-2">
              {chatHistory.slice(0, 10).map(msg => (
                <button
                  key={msg.id}
                  onClick={() => onSelectHistory(msg)}
                  className="w-full text-left px-3 py-2 text-sm bg-white dark:bg-mining-bg border border-slate-200 dark:border-mining-border rounded-lg hover:border-slate-300 dark:hover:border-mining-border hover:bg-slate-50 dark:hover:bg-mining-surface transition-colors"
                >
                  <div className="truncate text-slate-900 dark:text-slate-100">{msg.question}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {new Date(msg.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
