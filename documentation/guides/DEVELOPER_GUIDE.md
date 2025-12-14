# Mining Co-Pilot - Developer Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Prerequisites](#prerequisites)
5. [Installation & Setup](#installation--setup)
6. [Database Schema](#database-schema)
7. [Application Flow](#application-flow)
8. [Core Components](#core-components)
9. [Services & Business Logic](#services--business-logic)
10. [Deployment](#deployment)
11. [Environment Variables](#environment-variables)
12. [Testing](#testing)
13. [Common Issues & Solutions](#common-issues--solutions)
14. [API Integration](#api-integration)
15. [Performance Optimization](#performance-optimization)

---

## Project Overview

**Mining Co-Pilot** is an intelligent AI-powered assistant for mining operations that combines:
- SQL database querying for structured operational data
- RAG (Retrieval-Augmented Generation) for document search
- Equipment optimization recommendations
- Production forecasting

The system automatically routes questions to the appropriate backend (SQL/RAG/Optimization) based on natural language understanding.

### Key Features
- ✅ Natural language querying of mining data
- ✅ Intelligent routing between SQL and document search
- ✅ Equipment combination optimization
- ✅ Production forecasting (7-30 days)
- ✅ CSV/Excel file import and indexing
- ✅ PDF document processing and RAG indexing
- ✅ Interactive data visualization with charts
- ✅ Chat history and citations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend (React)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   ChatTab    │  │  SettingsTab │  │   Sidebar    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Services Layer (TypeScript)               │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Router  │  │   RAG   │  │    SQL   │  │Optimizer │     │
│  └─────────┘  └─────────┘  └──────────┘  └──────────┘     │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Supabase Backend (PostgreSQL)                   │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │   Database       │  │  Edge Functions  │                │
│  │  - Tables        │  │  - PDF Extract   │                │
│  │  - RLS Policies  │  │                  │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    External APIs                             │
│              OpenAI API (GPT-4 + Embeddings)                │
└─────────────────────────────────────────────────────────────┘
```

### Request Flow

```
User Question
    │
    ▼
ChatTab Component
    │
    ▼
App.tsx (handleSendMessage)
    │
    ├──> routeQuestion() ────> OpenAI API (GPT-4)
    │         │
    │         ├──> Decision: SQL
    │         ├──> Decision: RAG
    │         └──> Decision: OPTIMIZE
    │
    ├──> [SQL Path]
    │     └──> generateSQLFromIntent() ──> executeSQL() ──> Supabase
    │
    ├──> [RAG Path]
    │     └──> queryRAG() ──> OpenAI Embeddings + Search ──> Supabase
    │
    └──> [OPTIMIZE Path]
          └──> optimizeEquipmentSelection() / forecastProduction()
                └──> Supabase (historical data)
    │
    ▼
Format Answer
    │
    ▼
Save to chat_history
    │
    ▼
Display to User
```

---

## Technology Stack

### Frontend
- **React 18.3.1** - UI framework
- **TypeScript 5.5.3** - Type safety
- **Vite 5.4.2** - Build tool and dev server
- **Tailwind CSS 3.4.1** - Styling
- **Lucide React** - Icons
- **Recharts 3.3.0** - Data visualization

### Backend
- **Supabase** - Database, authentication, storage
- **PostgreSQL** - Primary database
- **Supabase Edge Functions** - Serverless functions (PDF processing)

### APIs & Services
- **OpenAI GPT-4** - Natural language understanding, SQL generation, RAG responses
- **OpenAI text-embedding-ada-002** - Vector embeddings for RAG
- **Supabase Storage** - File storage (PDFs, CSVs)

---

## Prerequisites

Before you begin, ensure you have:

1. **Node.js** >= 18.x
2. **npm** >= 9.x
3. **Git**
4. **Supabase Account** (free tier works)
5. **OpenAI API Key** (requires credits/subscription)

---

## Installation & Setup

### Step 1: Clone the Repository

```bash
git clone <your-github-repo-url>
cd mining-copilot
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**How to get these values:**
1. Go to [supabase.com](https://supabase.com)
2. Create a new project (or use existing)
3. Navigate to Settings → API
4. Copy `Project URL` → Use as `VITE_SUPABASE_URL`
5. Copy `anon public` key → Use as `VITE_SUPABASE_ANON_KEY`

### Step 4: Set Up Database

#### Option A: Using Supabase Dashboard

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Run each migration file in order from `supabase/migrations/`:

```bash
# Run migrations in this order:
1. 20251027020924_create_mining_copilot_schema.sql
2. 20251027023253_add_storage_and_processing.sql
3. 20251027023850_add_openai_api_key_to_settings.sql
4. 20251027024529_add_helper_functions.sql
5. 20251027024635_allow_anon_access_for_testing.sql
6. 20251027025039_fix_users_insert_policy.sql
7. 20251027030242_create_mining_operations_tables.sql
8. 20251027132728_update_trips_table_columns.sql
9. 20251029051441_update_production_summary_table.sql
10. 20251029081712_add_fulltext_search_to_rag_chunks.sql
11. 20251029131302_create_documents_storage_bucket.sql
12. 20251031044533_create_trip_summary_by_date_table.sql
```

#### Option B: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push all migrations
supabase db push
```

### Step 5: Deploy Edge Functions (for PDF processing)

```bash
# Navigate to your project
cd mining-copilot

# Deploy the PDF extraction function
supabase functions deploy extract-pdf
```

### Step 6: Configure OpenAI API Key

The OpenAI API key is stored in the database per user:

1. Start the application (see Step 7)
2. Navigate to **Settings** tab
3. Enter your OpenAI API key
4. Click **Save Settings**

### Step 7: Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Step 8: Build for Production

```bash
npm run build
```

Build output will be in the `dist/` directory.

---

## Database Schema

### Core Tables

#### `users`
Stores user information (currently using a default test user).

```sql
- id: uuid (primary key)
- email: text
- created_at: timestamptz
```

#### `uploaded_files`
Tracks all uploaded files and their indexing status.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key)
- filename: text
- file_type: text (CSV, PDF, XLSX, etc.)
- namespace: text (unique identifier for RAG)
- status: text (pending, indexing, ready, error)
- progress: integer (0-100)
- storage_path: text
- size_bytes: bigint
- doc_count: integer
- version: integer
- created_at: timestamptz
```

#### `rag_chunks`
Stores document chunks with embeddings for RAG search.

```sql
- id: uuid (primary key)
- file_id: uuid (foreign key)
- namespace: text
- content: text
- embedding: vector(1536) -- OpenAI embeddings
- metadata: jsonb
- chunk_index: integer
- created_at: timestamptz
```

**Indexes:**
- Full-text search: `tsvector` on content
- Vector similarity: `ivfflat` index on embedding
- Namespace lookup: btree index

#### `chat_history`
Stores all chat conversations.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key)
- question: text
- answer: text
- route_taken: text (sql, rag, optimize)
- confidence: real
- manual_override: boolean
- sql_query: text
- citations: jsonb
- tokens_used: integer
- latency_ms: integer
- created_at: timestamptz
```

#### `rag_settings`
User-specific RAG configuration.

```sql
- id: uuid (primary key)
- user_id: uuid (foreign key)
- row_chunk_size: integer
- chunk_overlap: integer
- top_k: integer
- search_combined: boolean
- embedding_model: text
- openai_api_key: text
- updated_at: timestamptz
```

#### `trip_summary_by_date`
Mining operations data - trips by equipment and date.

```sql
- id: uuid (primary key)
- user_id: uuid
- trip_date: date
- shift: text (A, B, C)
- tipper_id: text
- excavator: text
- route_or_face: text
- trip_count: integer
- remarks: text
- created_at: timestamptz
```

#### `production_summary`
Daily production metrics.

```sql
- id: uuid (primary key)
- user_id: uuid
- date: date
- shift: text
- qty_ton: numeric
- qty_m3: numeric
- target_ton: numeric
- target_m3: numeric
- created_at: timestamptz
```

### Row Level Security (RLS)

All tables have RLS enabled with policies for:
- ✅ Anonymous access (for development/testing)
- ✅ Authenticated user access (production-ready)

**Security Note:** The current setup allows anonymous access for testing. For production:
1. Remove anonymous policies
2. Implement proper authentication
3. Restrict access to user's own data only

---

## Application Flow

### 1. Application Initialization

**File:** `src/App.tsx`

```typescript
useEffect(() => {
  initializeUser(); // Load user settings, files, chat history
}, []);
```

**What happens:**
- Loads user settings from `rag_settings` table
- Fetches uploaded files from `uploaded_files` table
- Retrieves chat history from `chat_history` table
- Initializes Supabase client

### 2. User Asks a Question

**Component:** `src/components/ChatTab.tsx`

User types question → handleSubmit() → calls `onSendMessage()`

### 3. Question Routing

**File:** `src/services/router.ts`

```typescript
const decision = await routeQuestion(question, schema, settings);
```

**Routing Logic:**

The router uses OpenAI GPT-4 to analyze the question and decide:

- **OPTIMIZE** - Equipment selection or forecasting questions
  - Keywords: "which excavator", "best combination", "forecast", "predict"
  - Examples: "I need 1 excavator and 3 tippers"

- **SQL** - Database queries, calculations, visualizations
  - Keywords: "show", "calculate", "average", "total", "graph", "chart"
  - Examples: "Show production in January", "Plot trips by excavator"

- **RAG** - Document search, procedural questions
  - Keywords: "how to", "best practice", "guidelines", "procedures"
  - Examples: "How to optimize fuel consumption"

### 4. Execution Paths

#### Path A: SQL Query

```typescript
// Generate SQL from intent
const sqlQuery = await generateSQLFromIntent(decision, schema, settings, chatHistory);

// Execute against Supabase
const result = await executeSQL(sqlQuery);

// Format results (with visualization if needed)
```

**How it works:**
1. GPT-4 generates SQL query based on:
   - Database schema
   - User question
   - Previous chat context
2. Query executed on Supabase
3. Results returned as JSON
4. If chart keywords detected → generates chart config
5. Renders data table or chart

#### Path B: RAG Search

```typescript
// Query RAG system
const ragResult = await queryRAG(
  question,
  settings,
  decision.namespaces,
  chatHistory
);
```

**How it works:**
1. Convert question to embedding (OpenAI)
2. Vector similarity search in `rag_chunks` table
3. Retrieve top-k most relevant chunks
4. Send chunks + question to GPT-4
5. Generate natural language answer
6. Return answer with citations

#### Path C: Optimization

```typescript
// Extract numbers from question
const excavatorCount = parseInt(question.match(/(\d+)\s+excavator/i)[1]);
const tipperCount = parseInt(question.match(/(\d+)\s+tipper/i)[1]);

// Run optimization
const result = await optimizeEquipmentSelection(excavatorCount, tipperCount);
```

**How it works:**
1. Parse equipment counts from question
2. Query historical performance data
3. Score all possible combinations
4. Return best combination with confidence score

### 5. Answer Display

**Component:** `src/components/AnswerFormatter.tsx`

- Renders markdown formatting
- Displays SQL queries in code blocks
- Shows charts using Recharts
- Displays citations

### 6. Save to History

```typescript
await saveChatMessage({
  user_id: userId,
  question,
  answer,
  route_taken: decision.task,
  confidence: decision.confidence,
  sql_query: sqlQuery,
  citations: citations,
  tokens_used: tokensUsed,
  latency_ms: latencyMs
});
```

---

## Core Components

### `src/App.tsx`
Main application container. Manages:
- State (chat history, files, settings)
- Message handling and routing
- File uploads
- Tab switching

**Key Functions:**
- `handleSendMessage()` - Processes user questions
- `handleUploadFiles()` - Manages file uploads
- `handleIndexFile()` - Triggers RAG indexing
- `loadData()` - Refreshes app state

### `src/components/ChatTab.tsx`
Chat interface component.
- Message input and submission
- Chat history display
- Force RAG checkbox

### `src/components/SettingsTab.tsx`
Settings management.
- RAG configuration (chunk size, overlap, top-k)
- OpenAI API key
- Database management (clear indexes, reset data)

### `src/components/Sidebar.tsx`
Navigation and quick access.
- Quick Questions (predefined queries)
- Recent chat history
- Branding

### `src/components/AnswerFormatter.tsx`
Answer rendering with:
- Markdown support
- SQL syntax highlighting
- Chart visualization
- Data tables

---

## Services & Business Logic

### `src/services/router.ts`

**Purpose:** Intelligent question routing using GPT-4

**Key Functions:**

```typescript
async function routeQuestion(
  question: string,
  schema: any,
  settings: RAGSettings
): Promise<RouterDecision>
```

Routes questions based on priority rules:
1. OPTIMIZE - Equipment/forecasting
2. SQL - Visualizations and calculations
3. RAG - Document search

```typescript
async function generateSQLFromIntent(
  decision: RouterDecision,
  schema: any,
  settings: RAGSettings,
  chatHistory: ChatMessage[]
): Promise<string>
```

Generates SQL queries using GPT-4 with:
- Database schema context
- Previous conversation
- Specific table selection rules

### `src/services/rag.ts`

**Purpose:** Document indexing and search using RAG

**Key Functions:**

```typescript
async function indexFile(
  fileRecord: UploadedFile,
  content: string,
  settings: RAGSettings,
  onProgress: Function
): Promise<{ success: boolean; chunks: number }>
```

Indexes a document:
1. Chunks content (CSV rows or text paragraphs)
2. Generates embeddings via OpenAI
3. Stores in `rag_chunks` table
4. Updates file status

```typescript
async function queryRAG(
  question: string,
  settings: RAGSettings,
  namespaces: string[],
  chatHistory: ChatMessage[]
): Promise<{ answer: string; citations: Citation[]; tokensUsed: number }>
```

Searches documents:
1. Generate question embedding
2. Vector similarity search
3. Combine with full-text search
4. Send to GPT-4 for answer generation

### `src/services/optimizer.ts`

**Purpose:** Equipment optimization and forecasting

**Key Functions:**

```typescript
async function optimizeEquipmentSelection(
  excavatorCount: number,
  tipperCount: number
): Promise<OptimizationResult>
```

Algorithm:
1. Fetch historical performance from `trip_summary_by_date`
2. Calculate efficiency scores (avg trips, total trips, consistency)
3. Generate all possible combinations
4. Score and rank combinations
5. Return top recommendation + alternatives

```typescript
async function forecastProduction(
  metric: 'trips' | 'production',
  days: number
): Promise<ForecastResult>
```

Forecasting:
1. Retrieve historical trip data
2. Calculate 7-day moving average
3. Compute linear regression trend
4. Project future values
5. Calculate confidence scores

### `src/services/database.ts`

**Purpose:** Database operations wrapper

**Key Functions:**
- `getChatHistory()` - Fetch chat messages
- `getUserFiles()` - Get uploaded files
- `getUserSettings()` - Load RAG settings
- `executeSQL()` - Run SQL queries
- `discoverSchema()` - Get database structure
- `saveChatMessage()` - Save conversation

### `src/services/csvImporter.ts`

**Purpose:** Import CSV data into database tables

Automatically:
- Creates table if not exists
- Maps column types
- Handles duplicates
- Returns import status

---

## Deployment

### Option 1: Netlify (Recommended)

**Prerequisites:**
- Netlify account
- GitHub repository

**Steps:**

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Deploy on Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect to GitHub and select your repository
   - Configure build settings:
     - **Build command:** `npm run build`
     - **Publish directory:** `dist`
   - Add environment variables:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
   - Click "Deploy site"

3. **Configure Redirects:**
   The `dist/_redirects` file is already configured for SPA routing.

### Option 2: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Follow prompts to configure
```

### Option 3: Custom Server (VPS/Cloud)

**Requirements:**
- Node.js 18+
- Nginx or Apache
- SSL certificate (Let's Encrypt)

**Steps:**

1. **Build the application:**
```bash
npm run build
```

2. **Serve static files:**
```bash
# Using serve
npm install -g serve
serve -s dist -p 3000

# Or using nginx
sudo cp -r dist/* /var/www/html/
```

3. **Configure Nginx:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Option 4: Docker

**Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-p", "3000"]
```

**Build and Run:**
```bash
docker build -t mining-copilot .
docker run -p 3000:3000 -e VITE_SUPABASE_URL=... -e VITE_SUPABASE_ANON_KEY=... mining-copilot
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://abc123.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...` |

### Optional Variables

None required - OpenAI API key is stored in database per user.

### Where to Set

- **Development:** `.env` file (not committed to git)
- **Production (Netlify/Vercel):** Dashboard environment variables
- **Docker:** Pass via `-e` flag or docker-compose

---

## Testing

### Manual Testing Checklist

#### 1. SQL Queries
- [ ] "Show production in January 2025"
- [ ] "Top 5 highest production days"
- [ ] "Compare shift A, B, C production"
- [ ] "Plot production with average line"

#### 2. RAG Search
- [ ] Upload a PDF document
- [ ] Wait for indexing to complete
- [ ] Ask: "What does the document say about safety?"
- [ ] Check citations appear

#### 3. Optimization
- [ ] "Which excavator and 3 tippers give best performance?"
- [ ] "I need 2 excavators and 4 tippers, what's the best combination?"
- [ ] Verify recommendations appear with confidence scores

#### 4. Forecasting
- [ ] "Predict next week's production"
- [ ] "Forecast production for next 14 days"
- [ ] Check trend direction and confidence levels

#### 5. File Upload
- [ ] Upload CSV file
- [ ] Verify import to database
- [ ] Verify RAG indexing
- [ ] Check status updates

### Automated Testing

Currently no automated tests. To add:

```bash
# Install testing libraries
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Run tests
npm test
```

---

## Common Issues & Solutions

### Issue: "Missing Supabase credentials"

**Cause:** Environment variables not loaded

**Solution:**
1. Verify `.env` file exists
2. Restart dev server: `npm run dev`
3. Check variable names start with `VITE_`

### Issue: "OpenAI API rate limit exceeded"

**Cause:** Too many API calls or insufficient credits

**Solution:**
1. Check OpenAI account billing
2. Add rate limiting in code
3. Use caching for repeated queries

### Issue: "Failed to index file"

**Cause:** OpenAI API key not configured or PDF extraction failed

**Solution:**
1. Go to Settings tab
2. Enter valid OpenAI API key
3. Verify Edge Function is deployed
4. Check file format is supported

### Issue: "SQL query returned no results"

**Cause:** No data in database or wrong date range

**Solution:**
1. Check if data is loaded
2. Verify table names match schema
3. Adjust date ranges in query

### Issue: Charts not displaying

**Cause:** Data format incompatible with Recharts

**Solution:**
1. Check SQL returns correct structure
2. Verify column names in chart config
3. Look for console errors

### Issue: "Build failed" during deployment

**Cause:** Missing dependencies or TypeScript errors

**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Check for errors
npm run build

# Fix TypeScript errors
npm run typecheck
```

---

## API Integration

### OpenAI API

**Used for:**
1. Question routing (GPT-4)
2. SQL generation (GPT-4)
3. RAG answer generation (GPT-4)
4. Text embeddings (text-embedding-ada-002)

**Rate Limits:**
- GPT-4: 500 requests/day (varies by tier)
- Embeddings: 3000 requests/day

**Cost Optimization:**
- Cache SQL queries in `sql_cache` table
- Reuse embeddings for same documents
- Use smaller models for simple tasks

### Supabase API

**Features Used:**
1. PostgreSQL database
2. Row Level Security (RLS)
3. Real-time subscriptions (not currently used)
4. Storage (file uploads)
5. Edge Functions (PDF processing)

**Limits (Free Tier):**
- Database: 500 MB
- Storage: 1 GB
- Edge Functions: 500K invocations/month

---

## Performance Optimization

### Frontend

1. **Code Splitting:**
   - Already implemented with dynamic imports
   - Further split with lazy loading:
   ```typescript
   const SettingsTab = lazy(() => import('./components/SettingsTab'));
   ```

2. **Image Optimization:**
   - Compress images before upload
   - Use WebP format
   - Lazy load images

3. **Bundle Size:**
   - Current: 738 KB (216 KB gzipped)
   - Target: < 500 KB
   - Use `npm run build -- --report` to analyze

### Backend

1. **Database Indexes:**
   - Already indexed: `rag_chunks` (vector, namespace)
   - Add indexes for frequently queried columns
   - Use EXPLAIN ANALYZE for slow queries

2. **Caching:**
   - SQL queries cached in `sql_cache` table
   - Cache embeddings to avoid regeneration
   - Use Redis for session cache (optional)

3. **Edge Functions:**
   - PDF extraction can be slow
   - Consider background processing
   - Implement retry logic

### RAG Optimization

1. **Chunk Size:**
   - Smaller chunks (5-10 rows) = more precise
   - Larger chunks (20-30 rows) = faster
   - Adjust based on document type

2. **Top-K:**
   - Lower (3-5) = faster, less context
   - Higher (8-10) = slower, more context
   - Use 5 as default

3. **Embedding Model:**
   - Current: text-embedding-ada-002 (1536 dimensions)
   - Consider: text-embedding-3-small (cheaper, smaller)

---

## Project Structure

```
mining-copilot/
├── src/
│   ├── components/          # React components
│   │   ├── AnswerFormatter.tsx
│   │   ├── ChatTab.tsx
│   │   ├── DataTab.tsx
│   │   ├── SettingsTab.tsx
│   │   └── Sidebar.tsx
│   ├── services/            # Business logic
│   │   ├── csvImporter.ts
│   │   ├── database.ts
│   │   ├── optimizer.ts     # NEW: Equipment optimization
│   │   ├── rag.ts
│   │   └── router.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   ├── ragIndexer.ts
│   │   ├── supabase.ts
│   │   └── validation.ts
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # App entry point
│   └── index.css            # Global styles
├── supabase/
│   ├── functions/           # Edge functions
│   │   └── extract-pdf/
│   └── migrations/          # Database migrations
├── dist/                    # Build output
├── public/                  # Static assets
├── .env                     # Environment variables (local)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## Additional Resources

### Documentation Files

- **README.md** - Project overview and quick start
- **OPTIMIZATION_FEATURE.md** - Equipment optimization details
- **RAG_INDEXING_GUIDE.md** - RAG system explanation
- **TRIP_DATA_LOADED_COMPLETE.md** - Data loading status

### External Links

- [Supabase Documentation](https://supabase.com/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Vite Guide](https://vitejs.dev/guide/)

### Support

For questions or issues:
1. Check existing documentation
2. Review Common Issues section
3. Check Supabase logs (Settings → Logs)
4. Enable browser console for debugging
5. Review OpenAI API usage (platform.openai.com)

---

## License

[Add your license information here]

---

## Contributors

[Add contributor information here]

---

**Last Updated:** November 2025
**Version:** 1.0.0
