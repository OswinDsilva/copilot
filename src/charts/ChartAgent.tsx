import { useCallback, useEffect, useRef, useState } from "react";
import type { PrepareChartRequest, ChartJob, ChartStatus, ChartConfig, ChartData } from "./types";
import { pollWithBackoff, type PollCheckResult } from "./utils";
import ChartRenderer from "./ChartRenderer";

// Lightweight API client used by the ChartAgent. Replace or extend with src/charts/apiClient.ts if available.
async function prepareChart(req: PrepareChartRequest, signal?: AbortSignal) {
  // Try the project's apiClient if available, otherwise POST to /api/charts/prepare
  const res = await fetch("/api/charts/prepare", {
    method: "POST",
    body: JSON.stringify(req),
    headers: { "Content-Type": "application/json" },
    signal,
  });
  if (!res.ok) {
    let errorMessage = `prepareChart failed: ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // If parsing error body fails, use status code
    }
    throw new Error(errorMessage);
  }
  return (await res.json()) as { job_id: string };
}

async function fetchChartJob(jobId: string, signal?: AbortSignal) {
  const res = await fetch(`/api/charts/job/${jobId}`, { signal });
  if (!res.ok) {
    let errorMessage = `fetchChartJob failed: ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody?.message) {
        errorMessage = errorBody.message;
      }
    } catch {
      // If parsing error body fails, use status code
    }
    throw new Error(errorMessage);
  }
  return (await res.json()) as ChartJob;
}

// Valid status values for type safety
// Note: Using ChartStatus from types.ts: 'pending' | 'processing' | 'done' | 'failed'
// Plus UI-only 'idle' state
const VALID_STATUSES: ReadonlyArray<ChartStatus | "idle"> = [
  "idle",
  "pending",
  "processing",
  "done",
  "failed"
];

function isValidStatus(status: string): status is ChartStatus | "idle" {
  return VALID_STATUSES.includes(status as any);
}

// Progress normalization helper with explicit contract support
function normalizeProgress(progress: number | null | undefined, unit?: "percent" | "fraction"): number {
  if (typeof progress !== "number") return 0;
  
  // If backend provides explicit unit, use it
  if (unit === "fraction") {
    return Math.max(0, Math.min(100, progress * 100));
  }
  if (unit === "percent") {
    return Math.max(0, Math.min(100, progress));
  }
  
  // Heuristic fallback: if value is <= 1 and > 0, treat as fraction (0-1)
  // This handles common cases but edge cases like 0.005 are ambiguous
  if (progress > 0 && progress <= 1) {
    return progress * 100;
  }
  
  // Clamp to 0-100 range for safety
  return Math.max(0, Math.min(100, progress));
}

// Deep equality check for sourceRef changes (optimized with hash for large objects)
// PERFORMANCE NOTE: This uses JSON.stringify which can be expensive (O(n)) for large objects.
// RECOMMENDED: Callers should memoize sourceRef with useMemo() to avoid unnecessary comparisons:
//   const sourceRef = useMemo(() => ({ type: 'sql_result', rows, columns }), [rows, columns]);
// This prevents the component from restarting jobs when sourceRef is recreated with identical content.
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;
  
  try {
    // For small objects, use JSON comparison. For larger ones, this could be replaced
    // with a lightweight hash function or require callers to memoize sourceRef.
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    
    // Warn in development if objects are large (potential performance issue)
    if (process.env.NODE_ENV !== "production" && aStr.length > 10000) {
      console.warn(
        "[ChartAgent] Large sourceRef detected (%d chars). Consider memoizing with useMemo to avoid deep equality checks.",
        aStr.length
      );
    }
    
    return aStr === bStr;
  } catch (err) {
    // Fallback to reference equality if serialization fails (e.g., circular references)
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ChartAgent] sourceRef is not serializable:", err);
    }
    return a === b;
  }
}

type ApiClient = {
  prepareChart: (req: PrepareChartRequest, signal?: AbortSignal) => Promise<{ job_id: string }>;
  fetchChartJob: (jobId: string, signal?: AbortSignal) => Promise<ChartJob>;
};

type Props = {
  // The raw SQL result or source_ref to prepare charts from. E.g. { type: 'sql_result', rows, columns } or a source_ref token.
  // IMPORTANT: For performance, memoize sourceRef with useMemo() to prevent unnecessary deep equality checks:
  //   const sourceRef = useMemo(() => ({ type: 'sql_result', rows, columns }), [rows, columns]);
  sourceRef?: PrepareChartRequest["source_ref"];
  // Required user ID for the chart preparation request
  userId?: string;
  // Source type for the chart data
  sourceType?: PrepareChartRequest["source_type"];
  // Optional inline data sample for client-side processing
  data_sample?: ChartData;
  // Optional hints for chart generation (e.g., user query for chart type detection)
  hints?: PrepareChartRequest["hints"];
  // Optionally allow embedding the agent in a small UI (controlsOnly hides renderer)
  controlsOnly?: boolean;
  // Optional onComplete callback
  onComplete?: (cfg: ChartConfig, data: ChartData) => void;
  // Lifecycle callbacks for instrumentation/analytics
  onStart?: (jobId: string) => void;
  onProgress?: (jobId: string, progress: number, message: string | null) => void;
  onFail?: (jobId: string | null, error: string) => void;
  onCancel?: (jobId: string | null) => void;
  // Optional API client injection for testing/mocking
  apiClient?: ApiClient;
  // Polling configuration
  maxPollingAttempts?: number;
  pollTimeoutMs?: number;
  // Debug mode to show job ID (auto-enabled in development)
  debug?: boolean;
};

export default function ChartAgent({ 
  sourceRef, 
  userId = "default-user",
  sourceType = "sql_result",
  data_sample,
  hints,
  controlsOnly = false, 
  onComplete,
  onStart,
  onProgress,
  onFail,
  onCancel,
  apiClient,
  maxPollingAttempts = 50,
  pollTimeoutMs = 3000,
  debug = process.env.NODE_ENV !== "production"
}: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<ChartStatus | "idle">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const startingRef = useRef(false); // Prevent duplicate job starts

  // Use provided API client or default fetch functions
  const _prepareChart = apiClient?.prepareChart ?? prepareChart;
  const _fetchChartJob = apiClient?.fetchChartJob ?? fetchChartJob;

  // Track mounted state to prevent setState after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // convenience reset
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    startingRef.current = false;
    setJobId(null);
    setProgress(0);
    setStatus("idle");
    setMessage(null);
    setChartConfig(null);
    setChartData(null);
  }, []);

  // Kick off a new prepare-chart job.
  const startJob = useCallback(async () => {
    // Prevent duplicate starts
    if (startingRef.current || abortRef.current) {
      return;
    }

    reset();
    startingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    
    if (!mountedRef.current) return;
    setStatus("pending");
    setMessage("Starting chart preparation...");

    const req: PrepareChartRequest = {
      user_id: userId,
      source_type: sourceType,
      source_ref: sourceRef ?? { sql_result: { query_id: "default" } },
      // Include data_sample if provided (for client-side processing)
      ...(data_sample && { data_sample }),
      // Merge provided hints with defaults
      hints: {
        prefer_chart_types: ["bar", "line"],
        max_rows_sample: 1000,
        ...hints,
      },
    }; // `hints` is defined in types.ts

    // Validate serialization in development
    if (process.env.NODE_ENV !== "production") {
      try {
        JSON.stringify(req);
      } catch (err) {
        console.error("[ChartAgent] sourceRef is not serializable. This will cause the request to fail:", err);
        const errorMsg = "sourceRef is not serializable";
        setStatus("failed");
        setMessage(errorMsg);
        onFail?.(null, errorMsg);
        startingRef.current = false;
        return;
      }
    }

    let currentJobId: string | null = null;

    try {
      const { job_id } = await _prepareChart(req, controller.signal);
      currentJobId = job_id;
      
      if (!mountedRef.current || controller.signal.aborted) return;
      
      setJobId(job_id);
      onStart?.(job_id);

      // Check if job is already done (for synchronous clients)
      const initialJob = await _fetchChartJob(job_id, controller.signal);
      
      if (!mountedRef.current || controller.signal.aborted) return;
      
      // If already done, skip polling
      if (initialJob.status === "done") {
        const config = initialJob.chart_config ?? null;
        const data = initialJob.chart_data ?? null;
        
        setChartConfig(config);
        setChartData(data);
        setStatus("done");
        setProgress(100);
        setMessage(initialJob.message ?? "Chart ready");
        onComplete?.(config!, data!);
        startingRef.current = false;
        return;
      }
      
      // Otherwise, poll for progress
      setMessage("Job created — polling for progress...");

      // Polling implementation using pollWithBackoff from src/charts/utils.ts
      const pollFn = async (): Promise<PollCheckResult<ChartJob>> => {
        const job = await _fetchChartJob(job_id, controller.signal);
        // Support explicit progress_unit from backend if available
        const normalizedProgress = normalizeProgress(
          job.progress,
          job.progress_unit as "percent" | "fraction" | undefined
        );

        if (!mountedRef.current || controller.signal.aborted) {
          return { done: true, result: job };
        }
        
        // Update progress state
        setProgress(normalizedProgress);
        setMessage(job.message ?? null);
        onProgress?.(job_id, normalizedProgress, job.message ?? null);
        
        // Validate status before setting
        const newStatus = job.status;
        if (newStatus && isValidStatus(newStatus)) {
          setStatus(newStatus);
        }

        // Check completion
        if (job.status === "done") {
          return { done: true, result: job };
        }

        if (job.status === "failed") {
          throw new Error(job.message || "Chart generation failed");
        }
        
        return {
          done: false,
          progress: normalizedProgress,
          message: job.message ?? undefined,
        };
      };

      const result = await pollWithBackoff(
        pollFn,
        {
          initialDelayMs: 300,
          maxDelayMs: pollTimeoutMs,
          maxAttempts: maxPollingAttempts,
          timeoutMs: pollTimeoutMs,
          signal: controller.signal,
        }
      );

      if (!mountedRef.current || controller.signal.aborted) return;

      // result.result should contain final job data
      const finalJob: ChartJob = result.result!;
      if (finalJob.status === "done") {
        // ChartJob uses chart_config and chart_data, not result.config/result.data
        const config = finalJob.chart_config ?? null;
        const data = finalJob.chart_data ?? null;
        
        setChartConfig(config);
        setChartData(data);
        setStatus("done");
        setMessage(finalJob.message ?? "Chart ready");
        
        if (config && data) {
          onComplete?.(config, data);
        }
      } else {
        const errorMsg = finalJob.message ?? "Unknown error from chart job";
        setStatus("failed");
        setMessage(errorMsg);
        onFail?.(job_id, errorMsg);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      
      if (controller.signal.aborted) {
        setStatus("idle"); // Reset to idle on cancel (no 'cancelled' status in ChartStatus)
        setMessage("Job cancelled");
        onCancel?.(currentJobId);
      } else {
        const errorMsg = err?.message ?? String(err);
        setStatus("failed");
        setMessage(errorMsg);
        onFail?.(currentJobId, errorMsg);
      }
    } finally {
      if (mountedRef.current) {
        abortRef.current = null;
        startingRef.current = false;
      }
    }
  }, [onComplete, onStart, onProgress, onFail, onCancel, reset, sourceRef, userId, sourceType, _prepareChart, _fetchChartJob, maxPollingAttempts, pollTimeoutMs]);

  const cancelJob = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setStatus("idle"); // Reset to idle (no 'cancelled' in ChartStatus)
      setMessage("Cancelling job...");
      onCancel?.(jobId);
    }
  }, [onCancel, jobId]);

  // Auto-start if a sourceRef is provided and we are idle
  // Use deep equality check to prevent unnecessary restarts on object recreation
  // NOTE: initialize to `undefined` so the first render with a non-empty
  // `sourceRef` is treated as a change and triggers auto-start.
  const prevSourceRef = useRef<PrepareChartRequest["source_ref"] | undefined>(undefined);
  
  useEffect(() => {
    const sourceChanged = !deepEqual(prevSourceRef.current, sourceRef);
    prevSourceRef.current = sourceRef;
    
    if (sourceRef && status === "idle" && sourceChanged && !startingRef.current) {
      startJob();
    }
  }, [sourceRef, status, startJob]);

  // Retry the last job with the same sourceRef
  const retryJob = useCallback(() => {
    if (status === "failed" || status === "idle") {
      startJob();
    }
  }, [status, startJob]);

  // Copy job ID to clipboard
  const copyJobId = useCallback(() => {
    if (jobId) {
      navigator.clipboard.writeText(jobId).catch(err => {
        console.error("Failed to copy job ID:", err);
      });
    }
  }, [jobId]);

  return (
    <div className="p-3 bg-white dark:bg-mining-surface rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-mining-text">Chart Agent</h3>
        <div className="flex gap-2">
          <button
            onClick={startJob}
            className="px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={status === "pending" || status === "processing"}
            aria-label="Prepare chart"
            aria-disabled={status === "pending" || status === "processing"}
          >
            Prepare Chart
          </button>
          {status === "failed" && (
            <button
              onClick={retryJob}
              className="px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
              aria-label="Retry job"
            >
              Retry
            </button>
          )}
          <button
            onClick={cancelJob}
            className="px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!abortRef.current}
            aria-label="Cancel current job"
            aria-disabled={!abortRef.current}
          >
            Cancel
          </button>
          <button
            onClick={reset}
            className="px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
            aria-label="Reset chart agent"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mb-3" role="status" aria-live="polite" aria-atomic="true">
        <div className="text-sm text-gray-600 dark:text-slate-400">
          Status: <span className="font-medium">{status}</span>
        </div>
        <div className="text-sm text-gray-600 dark:text-slate-400">
          Message: <span className="font-medium">{message ?? "—"}</span>
        </div>
        {debug && jobId && (
          <div className="text-sm text-gray-600 dark:text-slate-400 flex items-center gap-2">
            Job ID: <span className="font-mono text-xs">{jobId}</span>
            <button
              onClick={copyJobId}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
              aria-label="Copy job ID to clipboard"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      <div className="mb-3">
        <div className="w-full bg-gray-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Chart preparation progress">
          <div 
            style={{ width: `${Math.round(progress)}%` }} 
            className="h-2 rounded-full bg-gradient-to-r from-green-400 to-green-600 dark:from-green-500 dark:to-green-700 transition-all duration-300" 
          />
        </div>
        <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">Progress: {Math.round(progress)}%</div>
      </div>

      {!controlsOnly && (
        <div className="mt-4">
          {status === "done" && chartConfig && chartData ? (
            <div role="region" aria-label="Chart visualization">
              <ChartRenderer config={chartConfig} data={chartData} />
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-400">No chart to render yet. Start the job to prepare chart data.</div>
          )}
        </div>
      )}
    </div>
  );
}