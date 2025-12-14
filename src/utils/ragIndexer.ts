import { getSupabaseClient } from './supabase';
import { indexFile } from '../router/services/rag';
import type { RAGSettings, UploadedFile } from '../types';

const supabase = getSupabaseClient();

export async function indexDatabaseTableToRAG(
  tableName: string,
  settings: RAGSettings,
  onProgress?: (message: string, progress: number) => void
): Promise<{ success: boolean; message: string; docCount?: number }> {
  try {
    onProgress?.(`Fetching data from ${tableName}...`, 10);

    const { data: rows, error } = await supabase
      .from(tableName)
      .select('*')
      .order('date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch data from ${tableName}: ${error.message}`);
    }

    if (!rows || rows.length === 0) {
      return { success: false, message: `No data found in ${tableName} table` };
    }

    onProgress?.(`Found ${rows.length} records in ${tableName}`, 20);

    const filename = `${tableName}_database`;
    const namespace = tableName;

    const existingFile = await supabase
      .from('uploaded_files')
      .select('*')
      .eq('filename', filename)
      .eq('namespace', namespace)
      .maybeSingle();

    let fileRecord: UploadedFile;

    if (existingFile.data) {
      onProgress?.('Removing existing RAG index...', 30);

      await supabase
        .from('rag_chunks')
        .delete()
        .eq('file_id', existingFile.data.id);

      fileRecord = existingFile.data;
    } else {
      onProgress?.('Creating new file record...', 30);

      const { data: newFile, error: fileError } = await supabase
        .from('uploaded_files')
        .insert({
          filename: filename,
          file_type: 'CSV',
          size_bytes: JSON.stringify(rows).length,
          namespace: namespace,
          user_id: '00000000-0000-0000-0000-000000000001'
        })
        .select()
        .single();

      if (fileError || !newFile) {
        throw new Error(`Failed to create file record: ${fileError?.message}`);
      }

      fileRecord = newFile;
    }

    await supabase
      .from('uploaded_files')
      .update({ status: 'indexing', progress: 40 })
      .eq('id', fileRecord.id);

    onProgress?.('Indexing data into RAG...', 40);

    const content = JSON.stringify(rows);

    //
// Optimized RAG Settings for DB Table Indexing
// --------------------------------------------
// - Use UI-selected row_chunk_size (never override to 1)
// - Force chunk_overlap = 0 (DB rows don't need overlap)
// - Use higher top_k if needed (not related to indexing)
//
  const ragSettings: RAGSettings = {
    ...settings,

    // Respect whatever the user set in RAG Settings
    row_chunk_size: settings.row_chunk_size && settings.row_chunk_size > 0
      ? settings.row_chunk_size
      : 10,   // fallback

    chunk_overlap: 0,

    // Retrieval setting, NOT indexing — just keep it reasonable
    top_k: settings.top_k && settings.top_k > 0
      ? settings.top_k
      : 20
  };


    const result = await indexFile(
      fileRecord,
      content,
      ragSettings,
      async (progress: number) => {
        const overallProgress = 40 + (progress * 0.5);
        onProgress?.(`Indexing chunks: ${progress}%`, overallProgress);

        await supabase
          .from('uploaded_files')
          .update({ progress: Math.floor(overallProgress) })
          .eq('id', fileRecord.id);
      }
    );

    if (!result.success) {
      await supabase
        .from('uploaded_files')
        .update({ status: 'error', error_message: result.error || 'Indexing failed' })
        .eq('id', fileRecord.id);

      throw new Error(result.error || 'Indexing failed');
    }

    await supabase
      .from('uploaded_files')
      .update({
        status: 'ready',
        progress: 100,
        doc_count: result.docCount || 0,
        indexed_at: new Date().toISOString()
      })
      .eq('id', fileRecord.id);

    onProgress?.('RAG indexing complete!', 100);

    return {
      success: true,
      message: `Successfully indexed ${rows.length} records from ${tableName} with ${result.docCount} chunks`,
      docCount: result.docCount
    };
  } catch (error: any) {
    console.error('RAG indexing error:', error);
    return {
      success: false,
      message: error.message || 'Unknown error during RAG indexing'
    };
  }
}
