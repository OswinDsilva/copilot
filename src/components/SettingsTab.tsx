import { useState } from 'react';
import { Save, Trash, RefreshCw, Database, Terminal, BarChart3, Activity, MessageCircle } from 'lucide-react';
import { RAG_PRESETS } from '../types';
import type { RAGSettings, UploadedFile } from '../types';
import DataTab from './DataTab';

type SettingsSubTab = 'config' | 'data' | 'sql' | 'charts' | 'diagnostics';

interface SettingsTabProps {
  settings: RAGSettings | null;
  files: UploadedFile[];
  onSave: (settings: Partial<RAGSettings>) => void;
  onClearIndex: () => void;
  onRebuildIndex: () => void;
  onUpload: (files: FileList) => void;
  onDelete: (fileId: string) => void;
  onIndexProduction?: (tableName: string, settings: RAGSettings) => Promise<void>;
}

export default function SettingsTab({ settings, files, onSave, onClearIndex, onRebuildIndex, onUpload, onDelete, onIndexProduction }: SettingsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('config');
  const [formData, setFormData] = useState({
    row_chunk_size: settings?.row_chunk_size ?? 10,
    chunk_overlap: settings?.chunk_overlap ?? 0,
    top_k: settings?.top_k ?? 5,
    search_combined: settings?.search_combined ?? true,
    embedding_model: settings?.embedding_model ?? 'text-embedding-ada-002',
    db_choice: settings?.db_choice ?? 'bolt',
    vector_store: settings?.vector_store ?? 'faiss',
    supabase_url: settings?.supabase_url ?? '',
    supabase_key: settings?.supabase_key ?? '',
    openai_api_key: settings?.openai_api_key ?? ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const applyPreset = (presetKey: keyof typeof RAG_PRESETS) => {
    const preset = RAG_PRESETS[presetKey];
    setFormData(prev => ({
      ...prev,
      row_chunk_size: preset.row_chunk_size,
      chunk_overlap: preset.chunk_overlap,
      top_k: preset.top_k
    }));
  };

  const subTabs = [
    { id: 'config' as SettingsSubTab, label: 'Configuration', icon: Save },
    { id: 'data' as SettingsSubTab, label: 'Data', icon: Database },
    { id: 'sql' as SettingsSubTab, label: 'SQL Console', icon: Terminal },
    { id: 'charts' as SettingsSubTab, label: 'Charts', icon: BarChart3 },
    { id: 'diagnostics' as SettingsSubTab, label: 'Diagnostics', icon: Activity }
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-mining-bg">
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex px-6">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors text-sm ${
                activeSubTab === tab.id
                  ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-900'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeSubTab === 'config' && (
          <div className="p-6">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-mining-text mb-6">Configuration</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-mining-text mb-4">RAG Configuration</h3>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-mining-text-secondary mb-2">Quick Presets</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(RAG_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key as keyof typeof RAG_PRESETS)}
                    className="px-4 py-2 text-sm border border-slate-300 dark:border-mining-border rounded-lg hover:border-blue-500 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors dark:text-mining-text-secondary"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Default WhatsApp Number</span>
                </div>
                <WhatsAppNumberSetting />
              </div>
              

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Row Chunk Size (1-50)
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">How many spreadsheet rows per chunk</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.row_chunk_size}
                  onChange={(e) => setFormData(prev => ({ ...prev, row_chunk_size: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Chunk Overlap (0-50)
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">How much the next chunk shares with previous</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={formData.chunk_overlap}
                  onChange={(e) => setFormData(prev => ({ ...prev, chunk_overlap: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Top-K (1-10)
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">How many top results to use</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.top_k}
                  onChange={(e) => setFormData(prev => ({ ...prev, top_k: parseInt(e.target.value) }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="search_combined"
                  checked={formData.search_combined}
                  onChange={(e) => setFormData(prev => ({ ...prev, search_combined: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 dark:text-blue-500 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 dark:bg-slate-700"
                />
                <label htmlFor="search_combined" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Search all files together (combined namespace)
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">API Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  OpenAI API Key
                  <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">Required for embeddings and chat</span>
                </label>
                <input
                  type="password"
                  value={formData.openai_api_key}
                  onChange={(e) => setFormData(prev => ({ ...prev, openai_api_key: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="sk-..."
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">OpenAI Platform</a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Embedding Model</label>
                <select
                  value={formData.embedding_model}
                  onChange={(e) => setFormData(prev => ({ ...prev, embedding_model: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="text-embedding-ada-002">text-embedding-ada-002 (Recommended)</option>
                  <option value="text-embedding-3-small">text-embedding-3-small</option>
                  <option value="text-embedding-3-large">text-embedding-3-large</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">Database Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Database Choice</label>
                <select
                  value={formData.db_choice}
                  onChange={(e) => setFormData(prev => ({ ...prev, db_choice: e.target.value as 'bolt' | 'supabase' }))}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="bolt">Bolt DB (Default)</option>
                  <option value="supabase">Supabase</option>
                </select>
              </div>

              {formData.db_choice === 'supabase' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Supabase URL</label>
                    <input
                      type="text"
                      value={formData.supabase_url}
                      onChange={(e) => setFormData(prev => ({ ...prev, supabase_url: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      placeholder="https://your-project.supabase.co"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Supabase Anon Key</label>
                    <input
                      type="password"
                      value={formData.supabase_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, supabase_key: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Vector Store</label>
                <select
                  value={formData.vector_store}
                  onChange={(e) => setFormData(prev => ({ ...prev, vector_store: e.target.value as 'faiss' | 'pgvector' }))}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                >
                  <option value="faiss">FAISS (Default)</option>
                  <option value="pgvector">pgvector (Supabase)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">Index Management</h3>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClearIndex}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash className="w-4 h-4" />
                <span>Clear Index</span>
              </button>

              <button
                type="button"
                onClick={onRebuildIndex}
                className="flex items-center gap-2 px-4 py-2 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Rebuild Index</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600"
            >
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </button>
          </div>
            </form>
          </div>
        </div>
      )}

      {activeSubTab === 'data' && (
        <DataTab
          files={files}
          onUpload={onUpload}
          onDelete={onDelete}
          onIndexProduction={onIndexProduction}
          ragSettings={settings || undefined}
        />
      )}

      {activeSubTab === 'sql' && (
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">SQL Console</h2>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
              <p className="text-slate-600 dark:text-slate-300">
                SQL Console allows you to run SELECT queries directly on the database.
                Generated queries from the Chat tab will appear here.
              </p>
              <div className="mt-6">
                <textarea
                  className="w-full h-40 px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                  placeholder="SELECT * FROM table LIMIT 10;"
                />
                <button className="mt-4 px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600">
                  Run Query
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'charts' && (
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">Charts</h2>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-12 text-center">
              <BarChart3 className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-300">
                Charts will appear here when you send numeric data from Chat or SQL Console.
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Supports line, bar, area, scatter, and combo charts with aggregations.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'diagnostics' && (
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-6">Diagnostics</h2>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Path</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Latency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Tokens</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Cache</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase">Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      No diagnostic data available yet
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function WhatsAppNumberSetting() {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem('default_whatsapp_number') || '';
    } catch {
      return '';
    }
  });

  const save = () => {
    try {
      if (value) localStorage.setItem('default_whatsapp_number', value);
      else localStorage.removeItem('default_whatsapp_number');
    } catch {}
  };

  return (
    <div className="space-y-2">
      <input
        type="tel"
        className="w-full px-3 py-2 border border-slate-300 rounded"
        placeholder="+1234567890"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="text-xs text-slate-500">Used to pre-fill the send prompt; editable each time.</p>
      <button type="button" onClick={save} className="px-3 py-2 bg-slate-100 border rounded">Save Default</button>
    </div>
  );
}
