import type { PrepareChartRequest, ChartJob } from './types';
import { detectChartType, normalizeChartData, extractRequestedChartType } from './chartDetector';

/**
 * Client-side synchronous API client for ChartAgent
 * No backend required - processes charts immediately
 */
export const syncChartClient = {
  /**
   * Prepares a chart synchronously from inline data
   */
  prepareChart: async (req: PrepareChartRequest, _signal?: AbortSignal): Promise<{ job_id: string }> => {
    // Generate a unique job ID
    const jobId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract data from data_sample (inline data for client-side processing)
    const rawData = req.data_sample || [];
    
    // Normalize data
    const chartData = normalizeChartData(rawData);
    
    // Check if user requested a specific chart type via query hint
    const requestedType = req.hints?.query ? extractRequestedChartType(req.hints.query) : null;
    
    // Detect chart type (or use provided params, or honor user request)
    const chartConfig = req.params?.chart_type 
      ? {
          chart_type: req.params.chart_type,
          x_column: req.params.x_column || '',
          y_columns: req.params.y_columns || [],
          ...(req.params as any)
        }
      : detectChartType(chartData, requestedType);
    
    // Store job result (in-memory for this session)
    const job: ChartJob = {
      id: jobId,
      status: 'done',
      progress: 100,
      chart_config: chartConfig,
      chart_data: chartData,
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString()
    };
    
    // Store in session storage for fetchChartJob
    sessionStorage.setItem(`chart_job_${jobId}`, JSON.stringify(job));
    
    return { job_id: jobId };
  },

  /**
   * Fetches a chart job (always returns done since processing is synchronous)
   */
  fetchChartJob: async (jobId: string, _signal?: AbortSignal): Promise<ChartJob> => {
    // Retrieve from session storage
    const stored = sessionStorage.getItem(`chart_job_${jobId}`);
    
    if (stored) {
      return JSON.parse(stored) as ChartJob;
    }
    
    // Job not found
    return {
      id: jobId,
      status: 'failed',
      message: 'Job not found',
      progress: 0
    };
  }
};
