## 🧭 Section 1 — Overall Description

The Chart Service currently uses a rule-based approach (keyword detection + column matching) to determine the appropriate chart type and configuration for a given dataset.

In future iterations, this system will include an LLM-based fallback capable of interpreting natural-language queries, inferring chart intent, and generating chart parameters when rule-based logic cannot confidently decide.

---

## 🗂️ Section 2 — File-by-File Documentation

### 📄 2.1 — types.ts

This file defines all core TypeScript types used across the chart module. It includes:

#### **ChartStatus**

Represents the state of a chart preparation job.

Possible values:
- `pending`
- `processing`
- `done`
- `failed`

Used inside the `ChartJob` structure.

---

#### **ChartJob**

Represents an asynchronous chart-preparation task the frontend must poll.

Includes:
- A job ID
- A status
- Optional progress (0–100)
- Optional `chart_config` (may be known early or late)
- Optional `chart_data` (inline small result)
- Optional `chart_data_url` (preferred for large results)
- Optional timestamps (`created_at`, `finished_at`)

This abstraction allows large or expensive charts to be generated in the background.

---

#### **ChartType**

A union of all supported chart types:

`bar`, `line`, `area`, `pie`, `scatter`, `radar`, `pareto`, `heatmap`, `custom`

This is the discriminator used throughout the rendering and server pipeline.

---

#### **ChartConfig (Union Type)**

A discriminated union of all chart configuration types:

- `XYChartConfig` (bar, line, area)
- `ScatterChartConfig`
- `ParetoChartConfig`
- `RadarChartConfig`
- `PieChartConfig`
- `HeatmapChartConfig`
- `CustomChartConfig`

Each config describes the shape, axes, and semantic meaning of the chart.

This is the core object the frontend renderer will use to decide what kind of chart to draw and which columns to read from the data.

---

#### **BaseChartConfig**

Contains fields shared across all chart types:

- `chart_type`
- Optional `title`, `legend`, `tooltip`
- Optional `metadata` (for extensibility)

Every chart configuration extends this base.

---

#### **XYChartConfig**

Used by:
- Line charts
- Bar charts
- Area charts

Specifies:
- The X column
- Optional X semantic type (datetime / numeric / categorical)
- An array of Y columns
- Optional aggregations per column
- Optional time bucketing instructions

---

#### **ScatterChartConfig**

Specifies:
- One X column
- One Y column
- Optional: bubble size, color categories

---

#### **ParetoChartConfig**

Specifies:
- A categorical column
- A numeric value column
- Optional sort direction (asc or desc)

---

#### **RadarChartConfig**

Specifies:
- A category column (series identifier)
- A list of axes (numeric dimensions to compare)

---

#### **PieChartConfig**

Specifies:
- A category column
- A single numeric value column

---

#### **HeatmapChartConfig**

Specifies:
- X column
- Y column
- Value column (numeric)

---

#### **CustomChartConfig**

A flexible chart type with no enforced structure.

Used for experimental or unsupported chart types.

---

#### **ChartRow / ChartData**

Defines the typed data structure used for rendering:

- `ChartRow` is a mapping of column name → value
- Values may be `string`, `number`, or `null`
- `ChartData` is simply an array of `ChartRow`

This structure ensures all chart renderers receive typed, uniform data.

---

### **PrepareChartRequest**

This type defines the shape of the request sent from the frontend to the backend when asking for a chart to be generated.

#### **Required fields**

**`user_id`** — identifies the requester

**`source_type`** — one of:
- `'sql_result'`
- `'csv'`
- `'table'`

**`source_ref`**

A structured pointer that tells the backend where to fetch the raw data.

Exactly one of the nested groups should be present:

- **csv**
```typescript
  {
    csv_id: string;
    file_name?: string;
  }
```

- **sql_result**
```typescript
  {
    query_id: string;
    query_hash?: string;
  }
```

- **table**
```typescript
  {
    table_name: string;
    schema_name?: string;
    database_name?: string;
  }
```

The backend inspects this object to load raw data appropriately.

---

#### **data_sample**

A small preview of the dataset (≤ 3 rows recommended).

Used for:
- LLM-based chart type inference
- Column type inference
- Safety checks before full data fetch

**Never send full CSVs in this field.**

---

#### **params**

Optional overrides or user-defined chart parameters.

Includes:
- Optional chart type
- Optional X/Y column lists
- Optional category/value columns
- Optional bucket
- Optional aggregation function (simple version)
- Sampling and max row limits
- Optional timeout
- Optional extra metadata

The backend uses this information to decide how to prepare the chart, or to override LLM/heuristic inference.

# 📄 2.2 — utils.ts

This file implements the polling utility used by the chart system to repeatedly check the status of long-running backend jobs. It provides:

- A cancel-safe sleep function
- A jitter helper to randomize retry delays
- A robust exponential-backoff polling loop
- Strongly typed error classes
- Rich progress reporting for the frontend

The frontend (especially ChartAgent) uses this utility to reliably wait for chart-preparation jobs to finish.

## PollCheckResult

Represents the return type of the polling check function (`checkFn`).

It is a discriminated union with two states:

### ✔ Success state

```typescript
{ done: true; result?: T }
```

Means:
- The job has completed
- `result` may contain the final chart result (config + data)

### ⏳ In-progress state

```typescript
{ done: false; progress?: number; message?: string }
```

Means:
- Polling should continue
- `progress` (optional) indicates fractional progress (0–1)
- `message` (optional) is a human-readable status string used in UI

## PollCheckFn

The function the poller repeatedly calls.

Shape:
- Asynchronous
- Accepts `{ signal?: AbortSignal }`
- Returns `PollCheckResult<T>`

It is the polling equivalent of "check the job on the server."

## PollOptions

Configurable runtime behaviour for the polling loop.

Includes:

**timeoutMs**  
Total allowed runtime for the entire polling operation. Once exceeded, polling stops with a timeout error.

**initialDelayMs**  
The delay before the second polling attempt (the first check happens immediately).

**maxDelayMs**  
Maximum allowed backoff delay so retries never grow unbounded.

**maxAttempts**  
The maximum number of polling attempts before giving up.

**backoffMultiplier**  
Factor used to grow the delay on each iteration (exponential backoff).

**jitter**  
Whether to randomize each delay by ±30% to avoid many clients polling at the exact same time.

**throwOnError**  
Determines whether errors thrown by `checkFn` immediately fail the poller, or whether errors are treated as non-fatal retryable states.

**signal**  
An optional `AbortSignal`. If aborted, the poller throws `PollCancelledError`.

## PollProgress

Represents live state exposed to the frontend while polling.

Fields:

**attempts** — how many times `checkFn` has run

**lastDelayMs** — the actual delay before the next iteration (after jitter + clamping)

**progress** — fractional 0–1 progress reported by backend

**message** — textual status message or error info

This makes it possible for the UI to show:
- "Attempt 3 of 10…"
- "Retrying in 2.4 seconds…"
- "Still processing (70%)…"

## PollResult

The final return type of `pollWithBackoff`.

Includes:

**result?: T** — the final backend result when `done: true`

**progress: PollProgress** — the final state snapshot when completion occurred

## Error Classes

The file defines three domain-specific error types:

### PollCancelledError

Thrown when:
- The provided `AbortSignal` is aborted before or during polling.

### PollTimeoutError

Thrown when:
- The total time exceeds `timeoutMs`.

### PollFailedError

Thrown when:
- `checkFn` throws and `throwOnError = true`, OR
- Maximum attempts exceeded.

These error classes allow the frontend to provide user-friendly and contextual messages.

## sleep(ms, signal)

A small internal helper providing:
- A Promise-based sleep
- Proper cancellation via `AbortSignal`
- Guaranteed cleanup of timers and listeners

This prevents common race conditions like:
- Abort happening between registering the listener and starting the timeout
- Timers firing after cancellation
- Memory leaks from unremoved listeners

## applyJitter(ms, fraction = 0.3)

Applies ±30% variation to a base delay.

- Used to avoid synchronized retry spikes ("thundering herd").
- Always returns a non-negative integer millisecond value.

## pollWithBackoff

This is the main exported function of the file.

It implements:
- Immediate first check
- Exponential backoff (`delayMs *= backoffMultiplier`)
- Optional jitter to randomize wait times
- A global timeout for the entire polling operation
- Max-attempt protection
- Full cancellation support
- Support for tolerant retry mode (`throwOnError = false`)
- Typed progress reporting
- Clear error semantics

### Polling lifecycle:

1. Record start time.
2. Loop until:
   - A success response (`done: true`) is returned
   - Timeout is exceeded
   - Max attempts reached
   - Aborted via signal
   - A fatal error occurs (depending on `throwOnError`)
3. On each iteration:
   - Call `checkFn`
   - If incomplete: update progress
   - Compute next delay (backoff + jitter)
   - Cap sleep to remaining timeout
   - Sleep using cancel-safe `sleep()`
   - Increase backoff delay for the next round

The function returns the final result along with the final progress.

## Typical Usage Pattern

1. Start a backend chart job
2. The backend returns a `job_id`
3. Construct a `checkFn` that queries `/chart-job/{job_id}` and returns `PollCheckResult`
4. Call `pollWithBackoff(checkFn, { timeoutMs: 60000, jitter: true, signal })`
5. Update UI using the returned progress during polling
6. Render the chart when `pollWithBackoff` resolves
7. Show user-friendly errors on `PollTimeoutError` or `PollFailedError`