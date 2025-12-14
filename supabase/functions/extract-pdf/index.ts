import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const contentType = req.headers.get("content-type") || "";
    
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Content-Type must be multipart/form-data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const fileId = formData.get("fileId") as string;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Processing PDF:", file.name, "Size:", file.size);

    const arrayBuffer = await file.arrayBuffer();
    const pdfData = new Uint8Array(arrayBuffer);

    let text = "";
    
    try {
      text = await extractTextFromPDF(pdfData);
    } catch (error) {
      console.error("PDF extraction error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to extract text from PDF", details: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "No text could be extracted from PDF" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Extracted text length:", text.length);

    if (fileId) {
      const storagePath = `pdfs/${fileId}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, pdfData, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
      } else {
        await supabase
          .from("uploaded_files")
          .update({ storage_path: storagePath })
          .eq("id", fileId);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: text,
        length: text.length,
        filename: file.name,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function extractTextFromPDF(pdfData: Uint8Array): Promise<string> {
  const textChunks: string[] = [];
  let inTextObject = false;
  let currentText = "";
  
  const decoder = new TextDecoder("latin1");
  const pdfString = decoder.decode(pdfData);
  
  const btRegex = /BT/g;
  const etRegex = /ET/g;
  const tjRegex = /\[([^\]]*)\]\s*TJ/g;
  const tjSingleRegex = /\(([^)]*)\)\s*Tj/g;
  const tdRegex = /\(([^)]*)\)\s*Td/g;
  
  let match;
  
  while ((match = tjRegex.exec(pdfString)) !== null) {
    const content = match[1];
    const innerMatches = content.match(/\(([^)]*)\)/g);
    if (innerMatches) {
      for (const inner of innerMatches) {
        const cleaned = inner.slice(1, -1)
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\\\/g, "\\");
        if (cleaned.trim()) {
          textChunks.push(cleaned);
        }
      }
    }
  }
  
  while ((match = tjSingleRegex.exec(pdfString)) !== null) {
    const text = match[1]
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\\\/g, "\\");
    if (text.trim()) {
      textChunks.push(text);
    }
  }
  
  while ((match = tdRegex.exec(pdfString)) !== null) {
    const text = match[1]
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\\\/g, "\\");
    if (text.trim()) {
      textChunks.push(text);
    }
  }
  
  let fullText = textChunks.join(" ").replace(/\s+/g, " ").trim();
  
  if (!fullText) {
    const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
    while ((match = streamRegex.exec(pdfString)) !== null) {
      const streamContent = match[1];
      const readable = streamContent.replace(/[^\x20-\x7E\n\r]/g, "");
      if (readable.length > 10) {
        textChunks.push(readable);
      }
    }
    fullText = textChunks.join(" ").replace(/\s+/g, " ").trim();
  }
  
  return fullText;
}
