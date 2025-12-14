import { X, FileText, FileCode, Printer, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useEffect, useRef, useState } from 'react';
import { sendWhatsApp, sendWhatsAppDocx, testTwilioCORS } from '../user_services/whatsapp/whatsappSender';
import { getDefaultWhatsAppNumber, isValidE164 } from '../user_services/whatsapp/phonePrefs';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string;
  onExport: (format: 'pdf' | 'text' | 'markdown' | 'docx') => void;
  isGenerating: boolean;
  // settings removed to avoid tight coupling; we read local default
}

export default function SummaryModal({ isOpen, onClose, summary, onExport, isGenerating }: SummaryModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [corsStatus, setCorsStatus] = useState<string>('untested');
  const [sendMode, setSendMode] = useState<'text' | 'docx'>('text');

  useEffect(() => {
    if (isOpen) {
      setPhone(getDefaultWhatsAppNumber());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Session Summary</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6" ref={contentRef}>
          {isGenerating ? (
            <div className="flex items-center justify-center h-32 space-x-2">
              <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
              <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-4 h-4 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <span className="ml-2 text-slate-600">Generating summary...</span>
            </div>
          ) : (
            <div className="prose prose-slate prose-sm max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-slate-700">Send to WhatsApp</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="px-2 py-2 border border-slate-300 rounded text-sm"
              value={sendMode}
              onChange={(e) => setSendMode(e.target.value as 'text' | 'docx')}
            >
              <option value="text">Send as Text</option>
              <option value="docx">Send as Word</option>
            </select>
            <input
              type="tel"
              className="flex-1 px-3 py-2 border border-slate-300 rounded"
              placeholder="+1234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              onClick={async () => {
                setSending(true);
                setSendErr(null);
                setSendMsg(null);
                console.log('[SummaryModal] Send clicked');
                console.log('[SummaryModal] Phone input:', phone);
                console.log('[SummaryModal] Valid E.164?', isValidE164(phone));
                console.log('[SummaryModal] Summary length:', summary?.length || 0);
                // Quick CORS probe
                const corsProbe = await testTwilioCORS();
                setCorsStatus(corsProbe.corsOk ? 'ok' : 'blocked');
                try {
                  if (!isValidE164(phone)) {
                    setSendErr('Please enter a valid E.164 number (e.g., +1234567890).');
                    return;
                  }
                  console.log('[SummaryModal] Calling sendWhatsApp...');
                  const res = sendMode === 'docx'
                    ? await sendWhatsAppDocx(phone, summary)
                    : await sendWhatsApp({ to: phone, message: summary });
                  console.log('[SummaryModal] sendWhatsApp result:', res);
                  if (res.success) {
                    setSendMsg(`Sent ${res.messageCount ?? 1} message(s).`);
                  } else {
                    setSendErr(res.error || 'Failed to send.');
                  }
                } catch (e: any) {
                  console.error('[SummaryModal] sendWhatsApp exception:', e);
                  setSendErr(e?.message || String(e));
                } finally {
                  setSending(false);
                }
              }}
              disabled={isGenerating || sending || !phone || !isValidE164(phone)}
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="text-xs text-slate-500">Default number can be changed in Settings. CORS: {corsStatus}.</p>
          {!isValidE164(phone) && phone && (
            <p className="text-xs text-amber-600">Enter a valid E.164 phone number starting with +</p>
          )}
          {sendMsg && <p className="text-xs text-green-700">{sendMsg}</p>}
          {sendErr && <p className="text-xs text-red-600">{sendErr}</p>}

          <div className="flex justify-end gap-3 mt-2">
          <button
            onClick={() => onExport('docx')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Word
          </button>
          <button
            onClick={() => onExport('text')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            Text
          </button>
          <button
            onClick={() => onExport('markdown')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <FileCode className="w-4 h-4" />
            Markdown
          </button>
          <button
            onClick={() => onExport('pdf')}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            PDF
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
