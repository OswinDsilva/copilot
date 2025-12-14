// Supabase Edge Function: send_whatsapp
// Receives { to: string, messages: string[] } and sends via Twilio WhatsApp API
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE_NO (e.g., whatsapp:+1234567890)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface SendRequest {
  to: string;
  messages?: string[];      // text messages (split client-side)
  mediaUrls?: string[];     // optional media URLs (e.g., docx/pdf) publicly accessible
  mediaBase64?: string;     // optional base64-encoded file content (docx)
  filename?: string;        // filename for uploaded media
  mime?: string;            // mime type for uploaded media
  body?: string;            // optional body when sending media
}

interface SendResponse {
  success: boolean;
  messageCount?: number;
  error?: string;
}

const ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const FROM = Deno.env.get('TWILIO_FROM_PHONE_NO'); // expected whatsapp:+E164
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const WHATSAPP_BUCKET = Deno.env.get('WHATSAPP_BUCKET') || 'whatsapp-media';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: SendResponse, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function isE164(num: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(num);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
  }

  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM) {
    return jsonResponse({ success: false, error: 'Server Twilio env missing' }, 500);
  }

  let payload: SendRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  const toE164 = payload?.to;
  const messages = payload?.messages;
  let mediaUrls = payload?.mediaUrls;
  const bodyOverride = payload?.body;

  if (!toE164) {
    return jsonResponse({ success: false, error: 'Missing destination number' }, 400);
  }
  if ((!messages || messages.length === 0) && (!mediaUrls || mediaUrls.length === 0) && !payload?.mediaBase64) {
    return jsonResponse({ success: false, error: 'Nothing to send: provide messages[], mediaUrls[], or mediaBase64' }, 400);
  }
  if (!isE164(toE164)) {
    return jsonResponse({ success: false, error: 'Invalid E.164 phone number' }, 400);
  }

  const auth = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  let sent = 0;

  // If mediaBase64 provided, upload to storage to obtain a public URL
  if (payload?.mediaBase64 && payload?.filename && payload?.mime) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ success: false, error: 'Server storage env missing' }, 500);
    }
    try {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const binary = Uint8Array.from(atob(payload.mediaBase64), c => c.charCodeAt(0));
      const path = `${Date.now()}-${payload.filename}`;
      const { error: uploadErr } = await supabase.storage.from(WHATSAPP_BUCKET).upload(path, binary, {
        contentType: payload.mime,
        upsert: true
      });
      if (uploadErr) {
        return jsonResponse({ success: false, error: `Upload failed (${WHATSAPP_BUCKET}): ${uploadErr.message}` }, 500);
      }
      // Prefer signed URL to work with private buckets; fallback to public URL if available
      const { data: signedData, error: signedErr } = await supabase.storage
        .from(WHATSAPP_BUCKET)
        .createSignedUrl(path, 600); // 10 minutes
      if (signedErr) {
        const { data: publicUrlData } = supabase.storage.from(WHATSAPP_BUCKET).getPublicUrl(path);
        if (!publicUrlData?.publicUrl) {
          return jsonResponse({ success: false, error: `Failed to get media URL: ${signedErr.message}` }, 500);
        }
        mediaUrls = [publicUrlData.publicUrl];
      } else {
        mediaUrls = [signedData.signedUrl];
      }
    } catch (e) {
      return jsonResponse({ success: false, error: `Upload exception: ${e instanceof Error ? e.message : String(e)}` }, 500);
    }
  }

  // Media send path: single message with media URLs
  if (mediaUrls && mediaUrls.length > 0) {
    const form = new URLSearchParams({
      From: FROM.startsWith('whatsapp:') ? FROM : `whatsapp:${FROM}`,
      To: `whatsapp:${toE164}`,
      Body: bodyOverride || "Here's the summary you requested!"
    });
    for (const m of mediaUrls) {
      form.append('MediaUrl', m);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    });

    if (!res.ok) {
      const txt = await res.text();
      return jsonResponse({ success: false, error: `Twilio error ${res.status}: ${txt}` }, 502);
    }
    sent = 1;
  }
  // Text-only path: multiple messages for chunks
  else if (messages && messages.length > 0) {
    for (let i = 0; i < messages.length; i++) {
      const partLabel = messages.length > 1 ? `(${i + 1}/${messages.length}) ` : '';
      const body = partLabel + messages[i];
      const form = new URLSearchParams({
        From: FROM.startsWith('whatsapp:') ? FROM : `whatsapp:${FROM}`,
        To: `whatsapp:${toE164}`,
        Body: body
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      });

      if (!res.ok) {
        const txt = await res.text();
        return jsonResponse({ 
          success: false, 
          error: `Twilio error ${res.status}: ${txt}` 
        }, 502);
      }
      sent += 1;
    }
  }

  return jsonResponse({ success: true, messageCount: sent }, 200);
});
