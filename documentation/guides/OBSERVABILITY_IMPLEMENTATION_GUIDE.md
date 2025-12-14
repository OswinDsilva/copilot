# Observability Implementation Guide
**Problem:** Zero visibility into production router behavior  
**Solution:** Structured logging + metrics + distributed tracing  
**Time to Implement:** 2-3 days  
**Impact:** Critical for production debugging

---

## Phase 1: Structured Logging (Day 1)

### Step 1.1: Install Dependencies

```powershell
npm install winston
npm install --save-dev @types/winston
```

### Step 1.2: Create Logger Utility

**File:** `src/utils/logger.ts`

```typescript
import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: logFormat,
  defaultMeta: { 
    service: 'mining-copilot-router',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      ),
    }),
    
    // Write all logs to files
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Production: Send logs to external service (e.g., Loggly, DataDog, CloudWatch)
if (process.env.NODE_ENV === 'production') {
  // Example: Add DataDog transport
  // logger.add(new winston.transports.Http({
  //   host: 'http-intake.logs.datadoghq.com',
  //   path: '/api/v2/logs',
  //   ssl: true,
  //   headers: {
  //     'DD-API-KEY': process.env.DATADOG_API_KEY,
  //   },
  // }));
}

// Helper functions for common logging patterns
export const loggerHelpers = {
  /**
   * Log a query routing event
   */
  logRoute: (params: {
    correlationId: string;
    question: string;
    intent: string;
    confidence: number;
    task: string;
    route_source: string;
    latency_ms: number;
    success: boolean;
  }) => {
    logger.info('router.route', {
      correlation_id: params.correlationId,
      question_length: params.question.length,
      intent: params.intent,
      confidence: params.confidence,
      task: params.task,
      route_source: params.route_source,
      latency_ms: params.latency_ms,
      success: params.success,
    });
  },

  /**
   * Log intent normalization
   */
  logIntent: (params: {
    correlationId: string;
    question: string;
    intent: string;
    confidence: number;
    matched_keywords: string[];
    parameters: Record<string, any>;
    latency_ms: number;
  }) => {
    logger.debug('router.intent', {
      correlation_id: params.correlationId,
      question_length: params.question.length,
      intent: params.intent,
      confidence: params.confidence,
      keyword_count: params.matched_keywords.length,
      parameter_count: Object.keys(params.parameters).length,
      latency_ms: params.latency_ms,
    });
  },

  /**
   * Log LLM calls
   */
  logLLM: (params: {
    correlationId: string;
    operation: 'routing' | 'sql_generation';
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    latency_ms: number;
    success: boolean;
    error?: string;
  }) => {
    logger.info('router.llm_call', {
      correlation_id: params.correlationId,
      operation: params.operation,
      model: params.model,
      prompt_tokens: params.prompt_tokens,
      completion_tokens: params.completion_tokens,
      total_tokens: params.total_tokens,
      latency_ms: params.latency_ms,
      success: params.success,
      error: params.error,
    });
  },

  /**
   * Log errors with full context
   */
  logError: (params: {
    correlationId: string;
    error: Error;
    context: Record<string, any>;
    fatal?: boolean;
  }) => {
    logger.error('router.error', {
      correlation_id: params.correlationId,
      error_message: params.error.message,
      error_stack: params.error.stack,
      error_name: params.error.name,
      context: params.context,
      fatal: params.fatal || false,
    });
  },
};

export default logger;
```

### Step 1.3: Add Correlation IDs

**File:** `src/utils/correlationId.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique correlation ID for request tracking
 * Format: timestamp-uuid (e.g., 20251114-abc123-def456)
 */
export function generateCorrelationId(): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 8);
  const uuid = uuidv4().split('-')[0]; // First segment only for brevity
  return `${timestamp}-${uuid}`;
}

/**
 * Store correlation ID in async context (for Node.js 14+)
 */
import { AsyncLocalStorage } from 'async_hooks';

const correlationIdStorage = new AsyncLocalStorage<string>();

export function withCorrelationId<T>(fn: () => T): T {
  const correlationId = generateCorrelationId();
  return correlationIdStorage.run(correlationId, fn);
}

export function getCorrelationId(): string {
  return correlationIdStorage.getStore() || 'no-correlation-id';
}
```

Install uuid:
```powershell
npm install uuid
npm install --save-dev @types/uuid
```

### Step 1.4: Instrument Router Entry Point

**File:** `src/router/index.ts` (MODIFIED)

```typescript
import type { RouterDecision, RAGSettings } from '../types';
import { normalizeUserQuery } from './services/intent';
import { detectQueryType } from './detectQueryType';
import { ruleRoute } from './ruleRouter';
import { fallbackRoute } from './fallbackRouter';
import { llmRoute } from './llmRouter';
import { THRESHOLDS } from './helpers/thresholds';
import logger, { loggerHelpers } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlationId';

/**
 * Main routing function with full observability
 */
export async function routeQuestion(
  question: string,
  schema?: any,
  settings?: RAGSettings
): Promise<RouterDecision> {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  // Log incoming request
  logger.info('router.request_start', {
    correlation_id: correlationId,
    question_length: question.length,
    has_schema: !!schema,
    has_api_key: !!settings?.openai_api_key,
  });

  try {
    // Step 1: Normalize intent and extract parameters
    const intentStartTime = performance.now();
    const intentInfo = normalizeUserQuery(question);
    const intentLatency = performance.now() - intentStartTime;
    
    loggerHelpers.logIntent({
      correlationId,
      question,
      intent: intentInfo.intent,
      confidence: intentInfo.confidence,
      matched_keywords: intentInfo.matched_keywords,
      parameters: intentInfo.parameters,
      latency_ms: intentLatency,
    });
    
    // Step 2: Detect query type
    const queryType = detectQueryType(question);
    logger.debug('router.query_type', {
      correlation_id: correlationId,
      query_type: queryType,
    });
    
    // Step 3: Try rule-based routing
    let decision = ruleRoute(question, intentInfo);
    let routeSource = 'rule';
    
    // Step 4: Fallback if no rule matched
    if (!decision) {
      logger.debug('router.fallback_triggered', {
        correlation_id: correlationId,
        reason: 'no_rule_matched',
      });
      decision = fallbackRoute(question);
      routeSource = 'fallback';
    }
    
    // Step 5: LLM routing for low confidence
    if (decision.confidence < THRESHOLDS.MEDIUM && schema && settings?.openai_api_key) {
      logger.info('router.llm_triggered', {
        correlation_id: correlationId,
        confidence: decision.confidence,
        reason: 'low_confidence',
      });
      
      const llmStartTime = performance.now();
      decision = await llmRoute(question, intentInfo, schema, settings);
      const llmLatency = performance.now() - llmStartTime;
      
      loggerHelpers.logLLM({
        correlationId,
        operation: 'routing',
        model: 'gpt-3.5-turbo',
        latency_ms: llmLatency,
        success: true,
      });
      
      routeSource = 'llm';
    } else if (decision.confidence < THRESHOLDS.HIGH) {
      logger.debug('router.medium_confidence', {
        correlation_id: correlationId,
        confidence: decision.confidence,
      });
    }
    
    // Attach metadata
    decision.intent = intentInfo.intent;
    decision.intent_confidence = intentInfo.confidence;
    decision.intent_keywords = intentInfo.matched_keywords;
    decision.parameters = intentInfo.parameters;
    (decision as any).query_type = queryType;
    (decision as any).correlation_id = correlationId;
    
    // Log successful routing
    const totalLatency = performance.now() - startTime;
    loggerHelpers.logRoute({
      correlationId,
      question,
      intent: intentInfo.intent,
      confidence: decision.confidence,
      task: decision.task,
      route_source: routeSource,
      latency_ms: totalLatency,
      success: true,
    });
    
    return decision;
    
  } catch (error) {
    // Log error with full context
    const totalLatency = performance.now() - startTime;
    
    loggerHelpers.logError({
      correlationId,
      error: error as Error,
      context: {
        question_length: question.length,
        has_schema: !!schema,
        has_api_key: !!settings?.openai_api_key,
        latency_ms: totalLatency,
      },
      fatal: true,
    });
    
    // Re-throw with correlation ID
    throw new Error(`[${correlationId}] ${(error as Error).message}`);
  }
}

export { generateSQLFromIntent } from './llmRouter';
```

---

## Phase 2: Metrics Collection (Day 2)

### Step 2.1: Install Prometheus Client

```powershell
npm install prom-client
npm install --save-dev @types/prom-client
```

### Step 2.2: Create Metrics Registry

**File:** `src/utils/metrics.ts`

```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
const register = new Registry();

// Add default metrics (CPU, memory, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register, prefix: 'mining_copilot_' });

// Custom metrics for router

/**
 * Total number of routing requests
 */
export const routerRequestsTotal = new Counter({
  name: 'mining_copilot_router_requests_total',
  help: 'Total number of router requests',
  labelNames: ['intent', 'task', 'route_source', 'success'],
  registers: [register],
});

/**
 * Router request duration histogram
 */
export const routerRequestDuration = new Histogram({
  name: 'mining_copilot_router_request_duration_seconds',
  help: 'Duration of router requests in seconds',
  labelNames: ['intent', 'task', 'route_source'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // 10ms to 10s
  registers: [register],
});

/**
 * Intent confidence distribution
 */
export const intentConfidence = new Histogram({
  name: 'mining_copilot_intent_confidence',
  help: 'Confidence score of intent detection',
  labelNames: ['intent'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [register],
});

/**
 * LLM API calls
 */
export const llmCallsTotal = new Counter({
  name: 'mining_copilot_llm_calls_total',
  help: 'Total number of LLM API calls',
  labelNames: ['operation', 'model', 'success'],
  registers: [register],
});

/**
 * LLM token usage
 */
export const llmTokensTotal = new Counter({
  name: 'mining_copilot_llm_tokens_total',
  help: 'Total tokens consumed by LLM',
  labelNames: ['operation', 'type'], // type: prompt or completion
  registers: [register],
});

/**
 * LLM call duration
 */
export const llmCallDuration = new Histogram({
  name: 'mining_copilot_llm_call_duration_seconds',
  help: 'Duration of LLM API calls',
  labelNames: ['operation', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30], // 500ms to 30s
  registers: [register],
});

/**
 * Current active routing requests
 */
export const activeRequests = new Gauge({
  name: 'mining_copilot_active_requests',
  help: 'Number of currently active routing requests',
  registers: [register],
});

/**
 * Rule matches per intent
 */
export const ruleMatchesTotal = new Counter({
  name: 'mining_copilot_rule_matches_total',
  help: 'Total number of rule matches',
  labelNames: ['rule_name', 'priority'],
  registers: [register],
});

/**
 * Cache hits/misses
 */
export const cacheHitsTotal = new Counter({
  name: 'mining_copilot_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['cache_type'], // e.g., 'query', 'intent'
  registers: [register],
});

export const cacheMissesTotal = new Counter({
  name: 'mining_copilot_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

/**
 * Error counter
 */
export const errorsTotal = new Counter({
  name: 'mining_copilot_errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'component'],
  registers: [register],
});

/**
 * Export metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}

export { register };
```

### Step 2.3: Instrument Router with Metrics

**File:** `src/router/index.ts` (ADD METRICS)

```typescript
import type { RouterDecision, RAGSettings } from '../types';
import { normalizeUserQuery } from './services/intent';
import { detectQueryType } from './detectQueryType';
import { ruleRoute } from './ruleRouter';
import { fallbackRoute } from './fallbackRouter';
import { llmRoute } from './llmRouter';
import { THRESHOLDS } from './helpers/thresholds';
import logger, { loggerHelpers } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlationId';

// Import metrics
import {
  routerRequestsTotal,
  routerRequestDuration,
  intentConfidence,
  activeRequests,
} from '../utils/metrics';

export async function routeQuestion(
  question: string,
  schema?: any,
  settings?: RAGSettings
): Promise<RouterDecision> {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  
  // Track active requests
  activeRequests.inc();
  
  // Log incoming request
  logger.info('router.request_start', {
    correlation_id: correlationId,
    question_length: question.length,
    has_schema: !!schema,
    has_api_key: !!settings?.openai_api_key,
  });

  try {
    // Step 1: Normalize intent
    const intentStartTime = performance.now();
    const intentInfo = normalizeUserQuery(question);
    const intentLatency = performance.now() - intentStartTime;
    
    // Record intent confidence metric
    intentConfidence.observe(
      { intent: intentInfo.intent },
      intentInfo.confidence
    );
    
    loggerHelpers.logIntent({
      correlationId,
      question,
      intent: intentInfo.intent,
      confidence: intentInfo.confidence,
      matched_keywords: intentInfo.matched_keywords,
      parameters: intentInfo.parameters,
      latency_ms: intentLatency,
    });
    
    // Step 2: Detect query type
    const queryType = detectQueryType(question);
    
    // Step 3: Route
    let decision = ruleRoute(question, intentInfo);
    let routeSource = 'rule';
    
    if (!decision) {
      decision = fallbackRoute(question);
      routeSource = 'fallback';
    }
    
    // Step 4: LLM if needed
    if (decision.confidence < THRESHOLDS.MEDIUM && schema && settings?.openai_api_key) {
      decision = await llmRoute(question, intentInfo, schema, settings);
      routeSource = 'llm';
    }
    
    // Attach metadata
    decision.intent = intentInfo.intent;
    decision.intent_confidence = intentInfo.confidence;
    decision.intent_keywords = intentInfo.matched_keywords;
    decision.parameters = intentInfo.parameters;
    (decision as any).query_type = queryType;
    (decision as any).correlation_id = correlationId;
    
    // Record metrics
    const totalLatency = (performance.now() - startTime) / 1000; // Convert to seconds
    
    routerRequestsTotal.inc({
      intent: intentInfo.intent,
      task: decision.task,
      route_source: routeSource,
      success: 'true',
    });
    
    routerRequestDuration.observe(
      {
        intent: intentInfo.intent,
        task: decision.task,
        route_source: routeSource,
      },
      totalLatency
    );
    
    loggerHelpers.logRoute({
      correlationId,
      question,
      intent: intentInfo.intent,
      confidence: decision.confidence,
      task: decision.task,
      route_source: routeSource,
      latency_ms: totalLatency * 1000,
      success: true,
    });
    
    return decision;
    
  } catch (error) {
    const totalLatency = (performance.now() - startTime) / 1000;
    
    // Record error metrics
    routerRequestsTotal.inc({
      intent: 'UNKNOWN',
      task: 'error',
      route_source: 'error',
      success: 'false',
    });
    
    loggerHelpers.logError({
      correlationId,
      error: error as Error,
      context: {
        question_length: question.length,
        latency_ms: totalLatency * 1000,
      },
      fatal: true,
    });
    
    throw new Error(`[${correlationId}] ${(error as Error).message}`);
    
  } finally {
    // Always decrement active requests
    activeRequests.dec();
  }
}
```

### Step 2.4: Expose Metrics Endpoint

**File:** `src/server.ts` (NEW - if you don't have a server yet)

```typescript
import express from 'express';
import { getMetrics } from './utils/metrics';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Metrics endpoint for Prometheus scraping
 */
app.get('/metrics', async (req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics', { error });
    res.status(500).send('Failed to generate metrics');
  }
});

/**
 * Router endpoint (example)
 */
app.post('/api/route', async (req, res) => {
  const { question, schema, settings } = req.body;
  
  try {
    const { routeQuestion } = await import('./router');
    const decision = await routeQuestion(question, schema, settings);
    res.json(decision);
  } catch (error) {
    logger.error('Route request failed', { error });
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(PORT, () => {
  logger.info('Server started', { port: PORT });
});
```

Install Express:
```powershell
npm install express
npm install --save-dev @types/express
```

---

## Phase 3: Distributed Tracing (Day 3 - Optional but Recommended)

### Step 3.1: Install OpenTelemetry

```powershell
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

### Step 3.2: Create Tracing Configuration

**File:** `src/utils/tracing.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Initialize tracing
export function initTracing() {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'mining-copilot-router',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // Noisy
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}
```

### Step 3.3: Add Tracing to Router

**File:** `src/router/index.ts` (ADD TRACING)

```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('mining-copilot-router');

export async function routeQuestion(
  question: string,
  schema?: any,
  settings?: RAGSettings
): Promise<RouterDecision> {
  // Create root span
  return await tracer.startActiveSpan('router.routeQuestion', async (span) => {
    const correlationId = generateCorrelationId();
    const startTime = performance.now();
    
    // Add span attributes
    span.setAttribute('correlation_id', correlationId);
    span.setAttribute('question_length', question.length);
    span.setAttribute('has_schema', !!schema);
    
    activeRequests.inc();

    try {
      // Step 1: Intent normalization (child span)
      const intentInfo = await tracer.startActiveSpan('router.normalizeIntent', async (intentSpan) => {
        const result = normalizeUserQuery(question);
        intentSpan.setAttribute('intent', result.intent);
        intentSpan.setAttribute('confidence', result.confidence);
        intentSpan.setStatus({ code: SpanStatusCode.OK });
        intentSpan.end();
        return result;
      });
      
      // ... rest of routing logic
      
      span.setAttribute('intent', intentInfo.intent);
      span.setAttribute('task', decision.task);
      span.setAttribute('route_source', routeSource);
      span.setStatus({ code: SpanStatusCode.OK });
      
      return decision;
      
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: (error as Error).message 
      });
      throw error;
      
    } finally {
      activeRequests.dec();
      span.end();
    }
  });
}
```

---

## Phase 4: Dashboards & Alerts (Day 3-4)

### Step 4.1: Create Grafana Dashboard

**File:** `grafana-dashboard.json`

```json
{
  "dashboard": {
    "title": "Mining Copilot Router",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "rate(mining_copilot_router_requests_total[5m])"
        }]
      },
      {
        "title": "Intent Distribution",
        "targets": [{
          "expr": "sum by (intent) (mining_copilot_router_requests_total)"
        }]
      },
      {
        "title": "Route Source Distribution",
        "targets": [{
          "expr": "sum by (route_source) (mining_copilot_router_requests_total)"
        }]
      },
      {
        "title": "P95 Latency",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(mining_copilot_router_request_duration_seconds_bucket[5m]))"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "rate(mining_copilot_router_requests_total{success=\"false\"}[5m])"
        }]
      },
      {
        "title": "LLM Call Rate",
        "targets": [{
          "expr": "rate(mining_copilot_llm_calls_total[5m])"
        }]
      },
      {
        "title": "Intent Confidence Distribution",
        "targets": [{
          "expr": "histogram_quantile(0.5, rate(mining_copilot_intent_confidence_bucket[5m]))"
        }]
      }
    ]
  }
}
```

### Step 4.2: Create Alert Rules

**File:** `prometheus-alerts.yml`

```yaml
groups:
  - name: mining_copilot_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(mining_copilot_router_requests_total{success="false"}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(mining_copilot_router_request_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P95 latency detected"
          description: "P95 latency is {{ $value }}s"

      # Low confidence queries
      - alert: LowConfidenceQueries
        expr: |
          histogram_quantile(0.5, rate(mining_copilot_intent_confidence_bucket[5m])) < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Many low confidence queries"
          description: "Median confidence is {{ $value }}"

      # High LLM usage (expensive!)
      - alert: HighLLMUsage
        expr: |
          rate(mining_copilot_llm_calls_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High LLM call rate"
          description: "LLM calls per second: {{ $value }}"

      # Service down
      - alert: ServiceDown
        expr: up{job="mining-copilot"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
```

---

## Phase 5: Usage Examples

### Example 1: Viewing Logs

```powershell
# View all logs
Get-Content logs/combined.log

# View only errors
Get-Content logs/error.log

# Follow logs in real-time
Get-Content logs/combined.log -Wait

# Filter by correlation ID
Get-Content logs/combined.log | Select-String "20251114-abc123"

# Count errors by type
Get-Content logs/error.log | Select-String "error_type" | Group-Object
```

### Example 2: Querying Metrics

```powershell
# Scrape metrics endpoint
Invoke-WebRequest -Uri http://localhost:3001/metrics

# View in browser
Start-Process http://localhost:3001/metrics
```

### Example 3: Analyzing Logs with PowerShell

```powershell
# Parse JSON logs and analyze
$logs = Get-Content logs/combined.log | ForEach-Object { $_ | ConvertFrom-Json }

# Average latency by intent
$logs | Where-Object { $_.message -eq "router.route" } | 
  Group-Object intent | 
  ForEach-Object { 
    [PSCustomObject]@{
      Intent = $_.Name
      AvgLatency = ($_.Group.latency_ms | Measure-Object -Average).Average
      Count = $_.Count
    }
  }

# Find slow queries (>1s)
$logs | Where-Object { $_.latency_ms -gt 1000 } | 
  Select-Object correlation_id, intent, latency_ms, question_length

# Error rate by hour
$logs | Where-Object { $_.level -eq "error" } | 
  Group-Object { [datetime]$_.timestamp | Get-Date -Format "yyyy-MM-dd HH:00" } | 
  Select-Object Name, Count
```

---

## Production Setup Checklist

### Before Deploying to Production:

- [ ] **Environment Variables**
  - [ ] Set `LOG_LEVEL=info` (or `warn` for production)
  - [ ] Set `NODE_ENV=production`
  - [ ] Configure external log destination (DataDog, CloudWatch, etc.)

- [ ] **Log Rotation**
  - [ ] Ensure `maxsize` and `maxFiles` are configured
  - [ ] Set up log archival/deletion policy
  - [ ] Monitor disk space usage

- [ ] **Metrics Collection**
  - [ ] Deploy Prometheus server to scrape `/metrics` endpoint
  - [ ] Set up Grafana for visualization
  - [ ] Configure alert rules

- [ ] **Monitoring & Alerts**
  - [ ] Set up PagerDuty/Opsgenie integration
  - [ ] Configure Slack notifications
  - [ ] Test alert delivery

- [ ] **Log Analysis**
  - [ ] Set up log aggregation (ELK, Splunk, etc.)
  - [ ] Create saved searches for common issues
  - [ ] Set up automated anomaly detection

---

## Quick Start (5 Minutes)

1. **Install dependencies:**
```powershell
npm install winston prom-client uuid
npm install --save-dev @types/winston @types/prom-client @types/uuid
```

2. **Copy files:**
   - `src/utils/logger.ts`
   - `src/utils/metrics.ts`
   - `src/utils/correlationId.ts`

3. **Update router:**
   - Add logging to `src/router/index.ts`
   - Add metrics to `src/router/index.ts`

4. **Create logs directory:**
```powershell
New-Item -ItemType Directory -Path logs -Force
```

5. **Run your app:**
```powershell
npm run dev
```

6. **View metrics:**
```powershell
Start-Process http://localhost:3001/metrics
```

7. **Tail logs:**
```powershell
Get-Content logs/combined.log -Wait
```

---

## Expected Results

### Before (Zero Observability):
```
❌ No visibility into routing decisions
❌ Can't debug why queries fail
❌ Don't know which intents are used most
❌ Can't measure latency
❌ No idea how much LLM costs
```

### After (Full Observability):
```
✅ Every query has a correlation ID for tracing
✅ Structured logs show exact decision path
✅ Metrics track request rate, latency, errors
✅ Dashboards visualize system health
✅ Alerts notify on issues before users complain
✅ LLM cost tracking shows $ spent per query
✅ Performance analysis identifies bottlenecks
```

---

## Next Steps After Implementation

1. **Week 1:** Monitor logs, tune log levels
2. **Week 2:** Create Grafana dashboards
3. **Week 3:** Set up alerts for critical issues
4. **Week 4:** Analyze metrics, optimize slow queries

---

## Common Issues & Solutions

### Issue: Logs too verbose
**Solution:** Set `LOG_LEVEL=warn` in production

### Issue: Metrics endpoint slow
**Solution:** Use caching, return cached metrics every 10s

### Issue: Correlation IDs lost in async code
**Solution:** Use `AsyncLocalStorage` (already included)

### Issue: Too many metrics (high cardinality)
**Solution:** Limit label values, aggregate less common intents

---

## Cost Estimate

- **Winston Logging:** Free (local files)
- **Prometheus:** Free (self-hosted)
- **Grafana:** Free (self-hosted) or $49/month (cloud)
- **External Log Service:** $50-200/month (DataDog, Loggly)
- **Time Investment:** 2-3 days initial setup, 1 hour/week maintenance

**ROI:** Pays for itself in first production incident you debug in minutes instead of hours.
