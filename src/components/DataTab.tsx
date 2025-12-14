import { useState } from 'react';
import { Upload, File, CheckCircle, AlertCircle, Loader, Trash2, Database } from 'lucide-react';
import type { UploadedFile, RAGSettings } from '../types';

interface DataTabProps {
  files: UploadedFile[];
  onUpload: (files: FileList) => void;
  onDelete: (fileId: string) => void;
  onIndexProduction?: (tableName: string, settings: RAGSettings) => Promise<void>;
  ragSettings?: RAGSettings;
}

export default function DataTab({ files, onUpload, onDelete, onIndexProduction, ragSettings }: DataTabProps) {
  const [dragActive, setDragActive] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [selectedTable, setSelectedTable] = useState('production_summary');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-5 h-5 text-blue-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'indexing':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <File className="w-5 h-5 text-slate-400" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleIndexProduction = async () => {
    if (!onIndexProduction || !ragSettings || indexing) return;

    setIndexing(true);
    try {
      await onIndexProduction(selectedTable, ragSettings);
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-mining-text">Data Management</h2>

          {onIndexProduction && (
            <div className="flex items-center gap-3">
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                disabled={indexing}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100 dark:disabled:bg-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="production_summary">production_summary</option>
                <option value="trip_summary_by_date">trip_summary_by_date</option>
              </select>

              <button
                onClick={handleIndexProduction}
                disabled={indexing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {indexing ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Indexing {selectedTable}...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    <span>Index to RAG</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto mb-4" />
          <p className="text-lg text-slate-700 dark:text-slate-300 mb-2">
            Drag and drop files here, or click to browse
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Supports CSV, XLSX, PDF, and DOCX files
          </p>
          <input
            type="file"
            id="file-upload"
            multiple
            accept=".csv,.xlsx,.pdf,.docx"
            onChange={handleFileInput}
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className="inline-block px-6 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg cursor-pointer hover:bg-blue-700 dark:hover:bg-blue-600"
          >
            Select Files
          </label>
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-4">Uploaded Files</h3>

          {files.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <File className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">No files uploaded yet</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-mining-surface border border-slate-200 dark:border-mining-border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-mining-surface border-b border-slate-200 dark:border-mining-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      File
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Docs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {files.map(file => (
                    <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(file.status)}
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{file.filename}</span>
                          </div>
                          {file.error_message && file.status === 'ready' && (
                            <span className="text-xs text-blue-600 ml-8">{file.error_message}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{file.file_type}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatBytes(file.size_bytes)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          file.status === 'ready' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                          file.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                          file.status === 'indexing' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400' :
                          'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
                        }`}>
                          {file.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{file.doc_count}</td>
                      <td className="px-6 py-4">
                        <div className="w-32">
                          <div className="bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                file.status === 'ready' ? 'bg-blue-600 dark:bg-blue-500' :
                                file.status === 'error' ? 'bg-red-600 dark:bg-red-500' :
                                'bg-blue-600 dark:bg-blue-500'
                              }`}
                              style={{ width: `${file.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{file.progress}%</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => onDelete(file.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
