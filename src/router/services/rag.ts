import { getSupabaseClient } from '../../utils/supabase';
import type { RAGSettings, Citation, UploadedFile } from '../../types';
import { estimateTokens } from '../../utils/validation';
import { retryWithBackoff, llmCircuitBreaker } from '../helpers/errorHandling';

const supabase = getSupabaseClient();

export async function createEmbedding(text: string, model: string = 'text-embedding-ada-002', apiKey?: string): Promise<number[]> {
  const OPENAI_API_KEY = apiKey || import.meta.env.VITE_OPENAI_API_KEY || '';

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please add it in Settings > Configuration > API Configuration');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

 
export async function createEmbeddingsBatch(
  texts: string[],
  model: string = 'text-embedding-ada-002',
  apiKey?: string
): Promise<number[][]> {
  if (!texts.length) return [];

  const OPENAI_API_KEY = apiKey || import.meta.env.VITE_OPENAI_API_KEY || '';

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please add it in Settings > Configuration > API Configuration');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      input: texts
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();

  // one embedding per input string
  if (!data.data || data.data.length !== texts.length) {
    throw new Error('Embedding API returned unexpected number of embeddings');
  }

  return data.data.map((d: any) => d.embedding as number[]);
}

export async function chunkCSVData(
  rows: any[],
  _headers: string[],
  chunkSize: number,
  overlap: number
): Promise<Array<{ content: string; metadata: any; index: number }>> {
  const chunks: Array<{ content: string; metadata: any; index: number }> = [];
  const step = Math.max(1, chunkSize - overlap);

  for (let i = 0; i < rows.length; i += step) {
    const rowSlice = rows.slice(i, i + chunkSize);

    // ✅ NEW FORMAT: Store rows as JSON + readable text for better LLM parsing
    const rowsAsJSON = rowSlice.map((row, idx) => {
      const rowNum = i + idx + 1;
      return `Row ${rowNum}: ${JSON.stringify(row)}`;
    }).join('\n');

    const content = `DATA ROWS (${i + 1} to ${i + rowSlice.length}):\n${rowsAsJSON}`;

    chunks.push({
      content,
      metadata: {
        start_row: i,
        end_row: i + rowSlice.length - 1,
        row_count: rowSlice.length,
        is_data_chunk: true,
        rows: rowSlice // ✅ Store actual row data for reconstruction
      },
      index: chunks.length
    });
  }

  return chunks;
}

export async function indexFile(
  file: UploadedFile,
  content: string,
  settings: RAGSettings,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; docCount?: number; error?: string }> {
  try {
    let chunks: Array<{ content: string; metadata: any; index: number }> = [];

    if (file.file_type === 'CSV' || file.file_type === 'XLSX') {
      const rows = JSON.parse(content);
      const headers = Object.keys(rows[0] || {});

      const summaryContent = `
FILE SUMMARY:
- Filename: ${file.filename}
- File Type: ${file.file_type}
- Total Rows: ${rows.length}
- Total Columns: ${headers.length}
- Column Names: ${headers.join(', ')}
- Sample Data (first row): ${JSON.stringify(rows[0] || {})}

This file contains ${rows.length} data records with ${headers.length} columns.
      `.trim();

      chunks.push({
        content: summaryContent,
        metadata: {
          is_summary: true,
          total_rows: rows.length,
          total_columns: headers.length,
          columns: headers
        },
        index: 0
      });

      const dataChunks = await chunkCSVData(
        rows,
        headers,
        settings.row_chunk_size,
        settings.chunk_overlap
      );
      
      chunks.push(...dataChunks.map(c => ({ ...c, index: c.index + 1 })));
    } else {
      // For text files, split by paragraphs or sentences
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
      chunks = paragraphs.map((p, i) => ({
        content: p.trim(),
        metadata: { paragraph: i },
        index: i
      }));
    }

    // ✅ CHANGE 1: Create ALL embeddings at once (batch)
    let embeddings: (number[] | null)[] = [];
    
    if (settings.vector_store === 'pgvector') {
      onProgress?.(20);
      console.log(`[RAG] Creating embeddings for ${chunks.length} chunks in batch...`);
      
      const chunkContents = chunks.map(c => c.content);
      
      // ✅ Using YOUR existing createEmbeddingsBatch function
      const embeddingResults = await createEmbeddingsBatch(
        chunkContents,
        settings.embedding_model,
        settings.openai_api_key
      );
      
      embeddings = embeddingResults;
      console.log(`[RAG] Created ${embeddings.length} embeddings`);
      onProgress?.(50);
    } else {
      embeddings = new Array(chunks.length).fill(null);
    }

    // ✅ CHANGE 2: Insert ALL chunks at once (batch)
    console.log(`[RAG] Inserting ${chunks.length} chunks into database in batch...`);
    
    // Check if there are existing chunks in the database
    const { data: existingChunks } = await supabase
      .from('rag_chunks')
      .select('id, file_id, chunk_index')
      .eq('file_id', file.id);
    
    if (existingChunks && existingChunks.length > 0) {
      console.log(`[RAG] Deleting ${existingChunks.length} existing chunks...`);
      const { error: deleteError } = await supabase
        .from('rag_chunks')
        .delete()
        .eq('file_id', file.id);
      
      if (deleteError) {
        console.error(`[RAG] Delete failed:`, deleteError);
        throw new Error(`Failed to delete existing chunks: ${deleteError.message}`);
      }
    }
    
    const chunksToInsert = chunks.map((chunk, i) => ({
      id: crypto.randomUUID(), // Generate UUID client-side to avoid PostgreSQL collision
      file_id: file.id,
      namespace: file.namespace,
      content: chunk.content,
      embedding: embeddings[i] ? `[${embeddings[i]!.join(',')}]` : null,
      metadata: { ...chunk.metadata, source_file: file.filename },
      chunk_index: chunk.index
    }));

    // ✅ Single batch insert for file namespace
    // Ensure unique chunk_index values (deduplicate if needed)
    const uniqueChunks = chunksToInsert.filter((chunk, index, self) =>
      index === self.findIndex(c => c.file_id === chunk.file_id && c.chunk_index === chunk.chunk_index)
    );
    
    const { error: insertError, data: insertedData } = await supabase
      .from('rag_chunks')
      .insert(uniqueChunks)
      .select('id');

    if (insertError) {
      console.error(`[RAG] Insert failed:`, insertError.message);
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }
    
    console.log(`[RAG] Successfully inserted ${insertedData?.length || 0} chunks`);

    onProgress?.(80);

    // ✅ CHANGE 3: Only insert to 'combined' if enabled (also batch)
    if (settings.search_combined) {
      console.log(`[RAG] Inserting ${chunks.length} chunks into 'combined' namespace in batch...`);
      
      // Recreate chunks from original data with fresh client-generated UUIDs
      const combinedChunks = chunks.map((chunk, i) => ({
        id: crypto.randomUUID(), // Generate UUID client-side
        file_id: file.id,
        namespace: 'combined',
        content: chunk.content,
        embedding: embeddings[i] ? `[${embeddings[i]!.join(',')}]` : null,
        metadata: { ...chunk.metadata, source_file: file.filename },
        chunk_index: chunk.index
      }));

      const { error: combinedError } = await supabase
        .from('rag_chunks')
        .insert(combinedChunks);

      if (combinedError) {
        console.warn(`[RAG] Failed to insert into combined namespace: ${combinedError.message}`);
      }
    }

    onProgress?.(100);

    return { success: true, docCount: chunks.length };
  } catch (error: any) {
    console.error('Indexing error:', error);
    return { success: false, error: error.message };
  }
}


export async function queryRAG(
  question: string,
  settings: RAGSettings,
  namespaces: string[] = ['combined'],
  chatHistory?: Array<{ question: string; answer: string; route_taken?: string }>
): Promise<{
  answer: string;
  citations: Citation[];
  tokensUsed: number;
}> {
  const OPENAI_API_KEY = settings.openai_api_key || import.meta.env.VITE_OPENAI_API_KEY || '';

  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please add it in Settings > Configuration > API Configuration');
  }

  const questionEmbedding = settings.vector_store === 'pgvector'
    ? await createEmbedding(question, settings.embedding_model, settings.openai_api_key)
    : null;

  let retrievedChunks: any[] = [];

  // Detect if this is a counting/aggregation query
  const isCountQuery = /how many|count|number of|total|sum of|average|percentage|what (?:is|are) the (?:count|number|total)/i.test(question);
  
  // Detect if this is a filtering query (needs more data)
  const isFilterQuery = /where|with|that|had|have|containing|includes|equals|is equal to/i.test(question);
  
  // For filtered count queries on uploaded files, try to get ALL chunks from that file
  let effectiveTopK = settings.top_k;
  if (isCountQuery && isFilterQuery && namespaces.length === 1 && namespaces[0] !== 'combined') {
    // Single file query with filtering - get more chunks
    console.log('[RAG] Detected filtered count query on specific file, fetching more chunks');
    effectiveTopK = 200; // Get up to 200 chunks (2000 rows if chunk_size=10)
  } else if (isCountQuery && isFilterQuery) {
    effectiveTopK = Math.min(settings.top_k * 10, 50);
  }
  
  if (effectiveTopK > settings.top_k) {
    console.log('[RAG] Increasing chunk retrieval to', effectiveTopK, 'for comprehensive data coverage');
  }

  // First, always try to get the summary chunk for file metadata queries
  if (isCountQuery) {
    console.log('[RAG] Detected count/aggregation query, fetching summary chunk first');
    const { data: summaryChunks } = await supabase
      .from('rag_chunks')
      .select('*, uploaded_files!inner(filename)')
      .in('namespace', namespaces)
      .eq('metadata->>is_summary', 'true')
      .limit(5);

    if (summaryChunks && summaryChunks.length > 0) {
      console.log('[RAG] Found summary chunks:', summaryChunks.length);
      retrievedChunks.push(...summaryChunks);
    }
  }

  if (settings.vector_store === 'pgvector' && questionEmbedding) {
    const { data } = await supabase.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_count: effectiveTopK,
      filter_namespaces: namespaces
    });

    if (data) {
      // Add vector search results, but avoid duplicates
      const existingIds = new Set(retrievedChunks.map(c => c.id));
      const newChunks = data.filter((c: any) => !existingIds.has(c.id));
      retrievedChunks.push(...newChunks);
    }
  } else {
    const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    let query = supabase
      .from('rag_chunks')
      .select('*, uploaded_files!inner(filename)')
      .in('namespace', namespaces);

    if (keywords.length > 0) {
      query = query.or(keywords.map(k => `content.ilike.%${k}%`).join(','));
    }

    const { data } = await query.limit(effectiveTopK);
    if (data) {
      const existingIds = new Set(retrievedChunks.map(c => c.id));
      const newChunks = data.filter((c: any) => !existingIds.has(c.id));
      retrievedChunks.push(...newChunks);
    }
  }

  if (retrievedChunks.length === 0) {
    return {
      answer: 'Not enough evidence found in the uploaded documents to answer this question.',
      citations: [],
      tokensUsed: estimateTokens(question)
    };
  }

  // DEBUG: Log retrieved chunks to understand what data is being sent to LLM
  console.log('[RAG DEBUG] Retrieved chunks:', {
    count: retrievedChunks.length,
    namespaces: [...new Set(retrievedChunks.map(c => c.namespace))],
    files: [...new Set(retrievedChunks.map(c => c.uploaded_files?.filename || 'unknown'))],
    first_chunk_preview: retrievedChunks[0]?.content?.substring(0, 300),
    sample_metadata: retrievedChunks[0]?.metadata
  });

  const context = retrievedChunks.map((chunk, idx) =>
    `[Source ${idx + 1}]: ${chunk.content}`
  ).join('\n\n');

  const recentHistory = chatHistory ? chatHistory.slice(-3) : [];
  let conversationContext = '';
  if (recentHistory.length > 0) {
    conversationContext = '\n\nRecent Conversation History:\n';
    recentHistory.forEach((msg, idx) => {
      conversationContext += `Q${idx + 1}: ${msg.question}\nA${idx + 1}: ${msg.answer.substring(0, 200)}...\n`;
    });
    conversationContext += '\nUse this history to understand context and references in the current question.\n';
  }

  const prompt = `Answer the following question using the information provided in the Context section below.

${conversationContext}

Context:
${context}

Question: ${question}

CRITICAL INSTRUCTIONS:

FOR "SHOW/GIVE/DISPLAY ROWS" QUERIES:
- The context contains actual data rows - extract and display them EXACTLY as they appear
- Data formats in context:
  * JSON format: Row 1: {"column1": "value1", "column2": "value2"}
  * Text format: column1: value1, column2: value2, column3: value3
- Extract EXACTLY the number of rows requested (e.g., "5 rows" = show 5 complete rows)
- Copy the ACTUAL values from the context - DO NOT use placeholders like "**" or "..."
- For JSON format: Parse each "Row N: {...}" line and extract the actual field values
- For text format: Split by commas and extract field:value pairs
- Present each row with ALL its fields and their REAL values from the context
- Example output format:
  Customer ID: 1
  Age: 55
  Gender: Male
  (etc. for all fields in that row)
- NEVER return empty values, asterisks, or placeholders - use the REAL data from context

FOR COUNT/AGGREGATION QUERIES:
- If the question asks "how many [items] have/had [condition]" (e.g., "how many payment methods had Venmo"):
  1. Look through ALL provided data chunks
  2. Count the occurrences that match the condition
  3. Report the total count from the data you see
  4. If the context doesn't show complete data, say: "Based on the provided sample, I found X occurrences. Note: This may not be the complete dataset."

FOR SUMMARY QUERIES:
- If the question asks for total rows/columns in a file:
  1. Look for "FILE SUMMARY" section FIRST
  2. Use the "Total Rows" or "Total Columns" value from the summary
  3. DO NOT count sample data rows manually

General Instructions:
- Read the Context section carefully
- The context contains data that may answer the question
- Present the relevant information from the context in your answer
- Include [Source N] citations for the data you use
- If you genuinely cannot find relevant information in the context, say: "I cannot find this information in the provided data."
- For summarize/show/list questions: extract and present the data clearly
- Copy values as they appear in the context
- When data is in "Row N: {JSON}" format, parse the JSON and display it clearly

Date format note: If dates appear as YYYY-MM-DD, the MM is the month number (01=Jan, 02=Feb, etc.)`;

  // Determine max_tokens based on query type
  const isShowRowsQuery = /give|show|display|list.*\d+\s*rows?/i.test(question);
  const maxTokens = isShowRowsQuery ? 2000 : 1000; // More tokens for row display

  try {
    // Use circuit breaker and retry logic for RAG query
    const result = await llmCircuitBreaker.execute(async () => {
      return await retryWithBackoff(
        async () => {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
              body: JSON.stringify({
              model: 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: 'You are a helpful assistant that answers questions based on provided context. Use the context to answer questions accurately.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.5,
              max_tokens: maxTokens
            })
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
          }

          const data = await response.json();
          
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response structure from OpenAI API');
          }

          return data.choices[0].message.content;
        },
        {
          operation: 'RAG Query',
          query: question,
          step: 'query_rag'
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          timeout: 30000
        }
      );
    });

    const citations: Citation[] = retrievedChunks.map(chunk => ({
      file_name: chunk.uploaded_files?.filename || 'Unknown',
      page_or_row: chunk.metadata?.start_row ?? chunk.metadata?.page ?? 'N/A',
      sheet: chunk.metadata?.sheet,
      content: chunk.content.substring(0, 200)
    }));

    return {
      answer: result,
      citations,
      tokensUsed: estimateTokens(context + question + result)
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[RAG Query] Error:', errorMessage);
    
    // Provide helpful error message
    if (errorMessage.includes('Circuit breaker is open')) {
      throw new Error(
        'RAG service is temporarily unavailable due to repeated failures. Please try again in a minute.'
      );
    } else if (errorMessage.includes('timed out')) {
      throw new Error(
        'RAG query timed out after 30 seconds. Please try simplifying your question.'
      );
    } else {
      throw new Error(
        `Failed to generate answer from documents: ${errorMessage}`
      );
    }
  }
}