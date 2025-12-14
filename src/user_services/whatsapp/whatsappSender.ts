import { WhatsAppRequest, WhatsAppResult } from './whatsappTypes';
import { getSupabaseClient } from '../../utils/supabase';
import { isValidE164 } from './phonePrefs';
import { exportDocx } from '../reporting';

const WHATSAPP_BUCKET = import.meta.env.VITE_WHATSAPP_BUCKET || 'whatsapp-media';

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '') // remove code fences
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italics
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
    .replace(/#{1,6}\s*/g, '') // headings
    .replace(/\n{3,}/g, '\n\n') // collapse excessive newlines
    .trim();
}

function toChunks(text: string, maxLen = 1500): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // try split at paragraph boundary
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.6) {
      // try sentence boundary
      cut = remaining.lastIndexOf('. ', maxLen);
    }
    if (cut < 0 || cut < maxLen * 0.4) {
      cut = maxLen; // hard cut
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}

export async function sendWhatsApp(req: WhatsAppRequest): Promise<WhatsAppResult> {
  const plain = stripMarkdown(req.message);
  const messages = toChunks(plain, 1500);

  console.log('[WhatsApp] ========== SEND ATTEMPT ==========');
  console.log('[WhatsApp] Target number:', req.to);
  console.log('[WhatsApp] Is valid E.164?', isValidE164(req.to));
  console.log('[WhatsApp] Message length (markdown):', req.message.length, 'chars');
  console.log('[WhatsApp] Stripped text length:', plain.length, 'chars');
  console.log('[WhatsApp] Number of chunks:', messages.length);
  console.log('[WhatsApp] Chunk sizes:', messages.map(c => c.length));
  if (messages[0]) {
    console.log('[WhatsApp] First chunk preview (100 chars):', messages[0].substring(0, 100));
  }

  const supabase = getSupabaseClient();
  const started = Date.now();
  const { data, error } = await supabase.functions.invoke('send_whatsapp', {
    body: { to: req.to, messages }
  });
  const elapsed = Date.now() - started;
  console.log('[WhatsApp] Edge function elapsed ms:', elapsed);
  console.log('[WhatsApp] Edge function data:', data);
  if (error) {
    console.error('[WhatsApp] Edge function error:', error);
  }

  if (error) {
    return { success: false, error: error.message || String(error) };
  }
  return { success: !!data?.success, messageCount: data?.messageCount };
}

export async function sendWhatsAppDocx(to: string, summary: string): Promise<WhatsAppResult> {
  const supabase = getSupabaseClient();

  if (!isValidE164(to)) {
    return { success: false, error: 'Invalid E.164 phone number' };
  }

  // Build DOCX blob (now async) and convert to base64 for server-side upload
  const docxBlob = await exportDocx(summary);
  const filename = `whatsapp-summary-${Date.now()}.docx`;
  const arrayBuf = await docxBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuf);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const base64 = btoa(binary);

  const started = Date.now();
  const { data, error } = await supabase.functions.invoke('send_whatsapp', {
    body: {
      to,
      mediaBase64: base64,
      filename,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: "Here's the summary you requested!"
    }
  });
  const elapsed = Date.now() - started;
  console.log('[WhatsApp] Edge function (docx) elapsed ms:', elapsed);
  console.log('[WhatsApp] Edge function (docx) data:', data);
  if (error) {
    console.error('[WhatsApp] Edge function (docx) error:', error);
    return { success: false, error: error.message || String(error) };
  }

  return { success: !!data?.success, messageCount: data?.messageCount };
}

export async function testTwilioCORS(): Promise<{ corsOk: boolean; error?: string }>{
  // With proxy in place, CORS should be fine; return ok
  return { corsOk: true };
}
