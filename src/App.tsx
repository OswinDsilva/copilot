import { useState, useEffect } from 'react';
import { MessageSquare, Settings, Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatTab from './components/ChatTab';
import SettingsTab from './components/SettingsTab';
import { getSupabaseClient } from './utils/supabase';
import { getChatHistory, getUserFiles, getUserSettings, saveUserSettings, clearAllIndexes, clearChatHistory, executeSQL, discoverSchema, saveChatMessage } from './router/services/database';
import { routeQuestion, generateSQLFromIntent } from './router';
import { queryRAG, indexFile } from './router/services/rag';
import { optimizeEquipmentSelection, forecastProduction } from './router/services/optimizer';
import { optimizeWithLLM } from './router/services/llmOptimizer';
import { quickContextCache } from './router/services/quickContextCache';
import { reportStore, exportText, printToPDF, downloadBlob, exportDocx } from './user_services/reporting';
import { summarizeReport } from './user_services/reporting/reportSummarizer';
import SummaryModal from './components/SummaryModal';
import type { ChatMessage, UploadedFile, RAGSettings } from './types';

type Tab = 'chat' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [settings, setSettings] = useState<RAGSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [userId] = useState('00000000-0000-0000-0000-000000000001');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  type RouteMeta = {
    route_source: 'deterministic' | 'llm';
    detected_intent?: string;
    intent_confidence?: number;
    matched_keywords?: string[];
    parameters?: Record<string, any>;
    template_used?: string;
  };

  const [routeSourceMap, setRouteSourceMap] = useState<Record<string, RouteMeta>>({});
  const [llmCallCount, setLlmCallCount] = useState(0);
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState<string>('');
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);

  useEffect(() => {
    initializeUser();
  }, []);

  // Start report session immediately on app load
  useEffect(() => {
    if (!reportSessionId) {
      const sessionId = `session_${Date.now()}_${userId.slice(0, 8)}`;
      reportStore.startSession(sessionId, userId);
      setReportSessionId(sessionId);
      console.log('[Report] Session started on app load:', sessionId);
      console.log('[Report] Initial session state:', reportStore.getSession());
    }
  }, [reportSessionId, userId]);

  const handleSummarize = async () => {
    setIsSummaryModalOpen(true);
    setIsSummarizing(true);
    try {
      const session = reportStore.getSession();
      if (!session) throw new Error('No active session');
      
      // Increment LLM counter for the summary generation
      setLlmCallCount(prev => prev + 1);
      
      const summary = await summarizeReport(session, settings || undefined);
      setSummaryText(summary);
    } catch (error) {
      console.error('Summarization failed:', error);
      setNotification({ type: 'error', message: 'Failed to generate summary' });
      setSummaryText('Error generating summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleExportSummary = async (format: 'pdf' | 'text' | 'markdown' | 'docx') => {
    if (!summaryText) return;
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `mining-copilot-summary-${timestamp}`;

    if (format === 'pdf') {
      printToPDF(summaryText);
    } else if (format === 'text') {
      const blob = exportText(summaryText);
      downloadBlob(blob, `${filename}.txt`);
    } else if (format === 'markdown') {
      const blob = new Blob([summaryText], { type: 'text/markdown;charset=utf-8' });
      downloadBlob(blob, `${filename}.md`);
    } else if (format === 'docx') {
      const blob = await exportDocx(summaryText);
      downloadBlob(blob, `${filename}.docx`);
    }
  };

  const initializeUser = async () => {
    try {
      // ULTRA-FAST TIMEOUT: Only wait 2 seconds for backend
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Initialization timeout')), 2000)
      );
      
      await Promise.race([
        loadData(),
        timeoutPromise
      ]);
      
      console.log('✓ Data loaded successfully');
    } catch (error) {
      console.warn('⚠️ Backend slow/unavailable - loading app anyway:', error);
      
      // Don't block the UI - let user use the app even if backend is slow
      setNotification({
        type: 'error',
        message: 'App loaded in offline mode. Some features may be limited.'
      });
      
      // Set empty defaults so app is usable
      setChatHistory([]);
      setFiles([]);
      // Keep settings as null if they couldn't be loaded - app will handle it
    }
  };

  const loadData = async (routeMapOverride?: Record<string, RouteMeta>) => {
    try {
      const [history, userFiles, userSettings] = await Promise.all([
        getChatHistory(userId),
        getUserFiles(userId),
        getUserSettings(userId)
      ]);

      // Merge any in-memory route_source info (temporary debugging map)
      const routeMapToUse = routeMapOverride || routeSourceMap;
      const mergedHistory = history.map((h: any) => ({
        ...h,
        route_source: h.route_source || routeMapToUse[h.id]?.route_source,
        detected_intent: h.detected_intent || routeMapToUse[h.id]?.detected_intent,
        intent_confidence: h.intent_confidence || routeMapToUse[h.id]?.intent_confidence,
        matched_keywords: h.matched_keywords || routeMapToUse[h.id]?.matched_keywords,
        parameters: h.parameters || routeMapToUse[h.id]?.parameters,
        template_used: h.template_used || routeMapToUse[h.id]?.template_used
      }));

      setChatHistory(mergedHistory);
      setFiles(userFiles);
      setSettings(userSettings);
    } catch (error) {
      console.error('Error loading data:', error);
      throw error;
    }
  };

  const handleSendMessage = async (question: string, route?: 'sql' | 'rag') => {
    if (!question.trim()) return;

    setIsLoading(true);

    try {
      if (!settings) {
        setNotification({ type: 'error', message: 'Settings not loaded. Please refresh the page.' });
        setTimeout(() => setNotification(null), 3000);
        setIsLoading(false);
        return;
      }

      const schema = await discoverSchema();

      let decision;
      if (route) {
        console.log('[Force RAG] User forced route:', route);
        decision = {
          task: route,
          confidence: 1.0,
          reason: 'User forced route via checkbox',
          namespaces: route === 'rag' ? ['combined', 'production_summary'] : undefined,
          route_source: 'deterministic' as const,
          original_question: question
        };
        // Forcing a route doesn't call the LLM for routing
      } else {
        decision = await routeQuestion(question, schema, settings, chatHistory, userId);
        // If routeQuestion used the LLM for routing, increment the counter
        if (decision.route_source === 'llm') {
          setLlmCallCount(c => {
            const next = c + 1;
            console.log('[LLM COUNTER] routing LLM used, new count:', next);
            return next;
          });
        }
      }

      console.log('[Routing Decision]', decision);

      const startTime = Date.now();
      let answer = '';
      let sqlQuery: string | undefined;
      let citations: any[] = [];
      let tokensUsed = 0;

  if (decision.task === 'optimize') {
        const excavatorMatch = question.match(/(\d+)\s+excavator/i);
        const tipperMatch = question.match(/(\d+)\s+tipper/i);
        const forecastMatch = question.match(/forecast|predict/i);
        const daysMatch = question.match(/(\d+)\s+days?/i);
        const bestComboMatch = question.match(/best\s+(?:tipper|excavator|equipment|machine|.*)\s+(?:combination|combo|pair|allocation)/i);
        
        // New: Target optimization matching
        const targetMatch = question.match(/(?:target|mine|production)\s+(?:of\s+)?(\d+)\s*(tons?|tonnes?|m3|meter cubed|cubic meters)/i);
        const remainingMatch = question.match(/(?:left|remaining|to go)\s+(?:to mine|to produce)?/i);
        const locationMatch = question.match(/at\s+(?:location\s+)?([a-zA-Z0-9\s]+)/i);
        
        // New: Duration/Seasonality matching
        const durationMatch = question.match(/in\s+(\d+)\s*(days?|months?|weeks?|hours?)/i);

        // Extract equipment constraints (broken/exclude vs only/include)
        // Use parameters from decision if available (merged from follow-up), otherwise parse from question
        let excludeMatch: string[] = [];
        let includeMatch: string[] = [];

        if (decision.parameters?.exclude_equipment) {
           excludeMatch = decision.parameters.exclude_equipment;
        } else {
           excludeMatch = Array.from(question.matchAll(/(?:broken|down|repair|exclude|without|no)\s+(?:is\s+)?([A-Z]{2,}-?\d+)/gi)).map(m => m[1].toUpperCase());
        }

        if (decision.parameters?.include_equipment) {
           includeMatch = decision.parameters.include_equipment;
        } else {
           includeMatch = Array.from(question.matchAll(/(?:only|use|have|with|include)\s+(?:is\s+)?([A-Z]{2,}-?\d+)/gi)).map(m => m[1].toUpperCase());
        }

        // Extract date filter from decision.parameters
        const dateFilter: any = {};
        if (decision.parameters) {
          if (decision.parameters.month) dateFilter.month = decision.parameters.month;
          if (decision.parameters.year) dateFilter.year = decision.parameters.year;
          if (decision.parameters.date_start) dateFilter.startDate = decision.parameters.date_start;
          if (decision.parameters.date_end) dateFilter.endDate = decision.parameters.date_end;
          // Add shift support
          if (decision.parameters.shift) {
             // Handle array of shifts or single shift
             const shifts = Array.isArray(decision.parameters.shift) ? decision.parameters.shift : [decision.parameters.shift];
             if (shifts.length > 0) dateFilter.shift = shifts[0]; // Optimizer currently handles single shift filtering
          }
        }

        // Use parameters for target/duration if available (merged from follow-up)
        let paramTarget = decision.parameters?.target;
        let paramDuration = decision.parameters?.duration;
        let paramUnit = decision.parameters?.unit || 'ton';

        // RECOVERY: Follow-ups often arrive without full structured params (e.g., DB history).
        // Recover missing pieces (target/duration/unit/shift) from quick cache.
        const looksLikeFollowUp =
          (excludeMatch.length > 0 || includeMatch.length > 0) ||
          /\b(?:already\s+mined|mined|done|completed|produced|broke\s*down|broken|failed|down|without|exclude|only|do\s+it|do\s+this)\b/i.test(question) ||
          /^\s*(?:shift\s*)?[ABC123]\s*$/i.test(question);

        if (looksLikeFollowUp) {
          const quickContext = quickContextCache.get(userId);
          const lastParams = quickContext?.lastParameters;

          if (lastParams) {
            const recovered: Record<string, any> = {};
            if (!paramTarget && lastParams.target) {
              paramTarget = lastParams.target;
              recovered.target = paramTarget;
            }
            if (!paramDuration && lastParams.duration) {
              paramDuration = lastParams.duration;
              recovered.duration = paramDuration;
            }
            if ((!decision.parameters?.unit || !paramUnit) && lastParams.unit) {
              paramUnit = lastParams.unit;
              recovered.unit = paramUnit;
            }
            if (!decision.parameters?.shift && lastParams.shift) {
              recovered.shift = lastParams.shift;
              dateFilter.shift = lastParams.shift;
            }

            if (Object.keys(recovered).length > 0) {
              console.log('[App.tsx] Recovered context from cache:', recovered);
              if (!decision.parameters) decision.parameters = {};
              Object.assign(decision.parameters, recovered);
            }
          }
        }

        if (targetMatch || paramTarget) {
          let targetValue = paramTarget ? parseInt(paramTarget) : parseInt(targetMatch![1]);
          let unit = paramUnit;
          if (!paramTarget && targetMatch) {
             const unitStr = targetMatch[2].toLowerCase();
             if (unitStr.startsWith('m') || unitStr.includes('cubic') || unitStr.includes('cubed')) {
               unit = 'm3';
             }
          }
          
          const location = locationMatch ? locationMatch[1].trim() : undefined;
          
          const constraints: string[] = [];
          if (location) constraints.push(`Location: ${location}`);
          if (remainingMatch) constraints.push(`Target is REMAINING amount to mine (adjust strategy for short-term catchup)`);
          if (excludeMatch.length > 0) constraints.push(`Exclude equipment: ${excludeMatch.join(', ')}`);
          if (includeMatch.length > 0) constraints.push(`Must use equipment: ${includeMatch.join(', ')}`);
          
          // Remaining trips scenario: "100 trips left" (we need this BEFORE forcing duration)
          const remainingTripsMatch = question.match(/(\d+)\s+trips?\s+(?:left|remaining)/i);
          const remainingTripsFromParams = typeof decision.parameters?.remaining_trips === 'number'
            ? decision.parameters.remaining_trips
            : undefined;
          const hasRemainingTripsContext = !!remainingTripsMatch || typeof remainingTripsFromParams === 'number';

          // Handle duration (required for most target-based optimization, but NOT required for
          // the remaining-trips workflow once shift is known)
          let duration: { value: number, unit: 'days' | 'months' | 'weeks' | 'hours' } | undefined;
          let shouldStopAndAsk = false;
          
           if (paramDuration) {
             // If duration comes from parameters (e.g. { value: 3, unit: 'days' } or just 3)
             if (typeof paramDuration === 'object') {
               duration = paramDuration;
             } else {
               duration = { value: parseInt(paramDuration), unit: 'days' }; // Default to days if unit missing
             }
             if (duration) constraints.push(`Time Frame: ${duration.value} ${duration.unit}`);
          } else if (durationMatch) {
            const val = parseInt(durationMatch[1]);
            const u = durationMatch[2].toLowerCase();
            let unitType: 'days' | 'months' | 'weeks' | 'hours' = 'days';
            if (u.startsWith('month')) unitType = 'months';
            if (u.startsWith('week')) unitType = 'weeks';
            if (u.startsWith('hour')) unitType = 'hours';
            duration = { value: val, unit: unitType };
            constraints.push(`Time Frame: ${val} ${unitType}`);
          } else if (!hasRemainingTripsContext) {
            // If target is specified but duration is missing, ask for it
            answer = `I see you want to optimize for **${targetValue} ${unit}**. To give you the best recommendation, please specify the time frame.\n\n` +
              `For example:\n` +
              `- **"Mine ${targetValue} ${unit} in 3 days"**\n` +
              `- **"Mine ${targetValue} ${unit} in 8 hours"**\n` +
              `- **"Mine ${targetValue} ${unit} in 1 month"**`;

            // Skip LLM call but still surface the message to the chat UI
            tokensUsed = 0;
            citations = [];
            shouldStopAndAsk = true;
          }

          // Detect partial target already mined and equipment breakdown follow-ups
          // Examples: "2500 tons already mined", "half the target done", "EX-141 broke down"
          let minedValue: number | null = null;
          const minedMatch = question.match(/(\d+)\s*(?:tons?|tonnes?|m3)\s+(?:already\s+)?(?:mined|done|completed|produced)/i);
          if (minedMatch) {
            minedValue = parseInt(minedMatch[1]);
          } else if (/half\s+the\s+target/i.test(question) || /half\s+of\s+the\s+target/i.test(question)) {
            minedValue = Math.floor(targetValue / 2);
          }

          // If we only have mined info but no target, prompt for target
          if (!targetValue && minedValue !== null) {
            answer = `I see you've already mined **${minedValue} ${unit}**. What is your total target so I can calculate the remaining plan?`;
            tokensUsed = 0;
            citations = [];
            shouldStopAndAsk = true;
          }

          // Broken equipment detection
          const brokenIds = Array.from(question.matchAll(/(?:broke\s*down|broken|failed|down)\s+([A-Z]{2,}-?\d+)/gi)).map(m => m[1].toUpperCase());
          if (brokenIds.length > 0) {
            constraints.push(`Equipment breakdown: ${brokenIds.join(', ')} (treat as unavailable)`);
            excludeMatch = Array.from(new Set([...excludeMatch, ...brokenIds]));
          }

          // Apply mined adjustment if possible
          if (minedValue !== null && targetValue) {
            const remainingTarget = Math.max(targetValue - minedValue, 0);
            constraints.push(`Remaining target after ${minedValue} ${unit} already mined: ${remainingTarget} ${unit}`);
            targetValue = remainingTarget;
            decision.parameters = {
              ...decision.parameters,
              target: remainingTarget,
              mined_amount: minedValue,
              unit
            };
          }

          // Remaining trips scenario: "100 trips left"
          if (remainingTripsMatch) {
            const remainingTrips = parseInt(remainingTripsMatch[1]);
            if (!dateFilter.shift) {
              // Persist remaining trips even when we're asking a clarifying question,
              // so the next shift-only reply can continue the workflow.
              if (!decision.parameters) decision.parameters = {};
              decision.parameters.remaining_trips = remainingTrips;

              answer = `Noted **${remainingTrips} trips left**. Which shift are you working on? (e.g., Shift A/B/C or Shift 1/2/3)`;
              tokensUsed = 0;
              citations = [];
              shouldStopAndAsk = true;
            } else {
              constraints.push(`Remaining trips available: ${remainingTrips}`);
              if (unit === 'ton' && targetValue > 0) {
                const tonsPerTripReq = targetValue / Math.max(remainingTrips, 1);
                constraints.push(`With ${remainingTrips} trips remaining, required average load is ~${tonsPerTripReq.toFixed(1)} ton/trip`);
              }
              decision.parameters = {
                ...decision.parameters,
                remaining_trips: remainingTrips
              };
            }
          } else if (typeof remainingTripsFromParams === 'number' && dateFilter.shift) {
            // Shift follow-up after we previously asked for it
            constraints.push(`Remaining trips available: ${remainingTripsFromParams}`);
            if (unit === 'ton' && targetValue > 0) {
              const tonsPerTripReq = targetValue / Math.max(remainingTripsFromParams, 1);
              constraints.push(`With ${remainingTripsFromParams} trips remaining, required average load is ~${tonsPerTripReq.toFixed(1)} ton/trip`);
            }
          }

          // CRITICAL: Update decision.parameters so they are saved to history for follow-up context
          if (!decision.parameters) decision.parameters = {};
          decision.parameters.target = targetValue;
          decision.parameters.unit = unit;
          if (duration) decision.parameters.duration = duration;
          if (excludeMatch.length > 0) decision.parameters.exclude_equipment = excludeMatch;
          if (includeMatch.length > 0) decision.parameters.include_equipment = includeMatch;
          if (location) decision.parameters.location = location;

          // If we asked a clarifying question, skip the optimizer call and let the message render
          if (shouldStopAndAsk) {
            // keep answer/tokens/citations as set above
          } else {

          // Use LLM Optimizer for smarter planning
          setLlmCallCount(c => {
            const next = c + 1;
            console.log('[LLM COUNTER] optimizeWithLLM called, new count:', next);
            return next;
          });
          
          const llmResult = await optimizeWithLLM({
            question,
            target: { value: targetValue, unit: unit as 'ton' | 'm3' },
            remaining_trips: typeof decision.parameters?.remaining_trips === 'number' ? decision.parameters.remaining_trips : undefined,
            shift: dateFilter.shift,
            constraints,
            dateFilter,
            duration
          });

          // Format table data from LLM plan
          const tableData = llmResult.plan.map(p => ({
            EXCAVATOR: p.excavator,
            TIPPER: p.tipper,
            TRIPS: p.assigned_trips,
            TONS: p.expected_tons,
            'VOLUME (m³)': p.expected_volume,
            EFFICIENCY: `${p.efficiency}%`,
            CONFIDENCE: `${p.confidence}%`
          }));

          answer = `### ${llmResult.recommendation}\n\n` +
            `**Goal:** Mine ${targetValue} ${unit}${location ? ` at ${location}` : ''}${remainingMatch ? ' (Remaining)' : ''}\n\n` +
            `**Strategy:**\n${llmResult.reasoning}\n\n` +
            `#### Recommended Equipment Allocation:\n` +
            `<<<JSON_TABLE_DATA>>>${JSON.stringify(tableData)}<<<JSON_TABLE_DATA>>>` +
            `\n\n**Overall Efficiency:** ${llmResult.overall_efficiency_percentage}%\n` +
            `**Efficiency Logic:**\n${llmResult.efficiency_explanation}\n\n`;
            
          // Add Statistics Section if available
          if (llmResult.statistics) {
            answer += `#### Production Statistics\n` +
              `- **Target Duration:** ${llmResult.statistics.target_duration}\n` +
              `- **Estimated Completion:** ${llmResult.statistics.estimated_completion_time}\n` +
              `- **Daily Production:** ${llmResult.statistics.daily_production} ${unit}/day\n` +
              `- **Required Daily Rate:** ${llmResult.statistics.required_daily_rate} ${unit}/day\n\n`;
          }

          answer += `**Summary:**\n${llmResult.summary}`;
          } // end shouldStopAndAsk guard
            
        } else if (forecastMatch) {
          const days = daysMatch ? parseInt(daysMatch[1]) : 7;
          
          // If user asks to forecast based on a specific month (e.g. "based on January data"),
          // we need to pass that filter to the forecast function.
          // The dateFilter object is already extracted above from decision.parameters.
          
          const forecastResult = await forecastProduction('trips', days, dateFilter);

          // Format forecast data as table
          const forecastTableData = forecastResult.predictions.map((pred: any, i: number) => ({
            '#': i + 1,
            DATE: pred.date,
            PREDICTED_TRIPS: pred.predictedValue,
            CONFIDENCE: `${pred.confidence}%`
          }));

           

          answer = `## Production Forecast for Next ${days} Days\n\n`;
          answer += `**Trend:** ${forecastResult.trend} (${forecastResult.trendPercentage > 0 ? '+' : ''}${forecastResult.trendPercentage}%)\n\n`;
          answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(forecastTableData)}<<<JSON_TABLE_DATA>>>`;
          answer += `\n\n*Forecast is based on historical trends and moving averages of your trip data${dateFilter.month ? ` from ${decision.parameters?.month_name}` : ''}.*`;
          answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(forecastTableData)}<<<JSON_TABLE_DATA>>>`;
          answer += `\n\n*Forecast is based on historical trends and moving averages of your trip data${dateFilter.month ? ` from ${decision.parameters?.month_name}` : ''}.*`;
        } else if (excavatorMatch && tipperMatch) {
          const excavatorCount = parseInt(excavatorMatch[1]);
          const tipperCount = parseInt(tipperMatch[1]);

          const result = await optimizeEquipmentSelection(
            excavatorCount, 
            tipperCount, 
            dateFilter,
            { include: includeMatch, exclude: excludeMatch }
          );

          // Format main recommendation as table
          const mainRecommendation = [{
            EXCAVATOR: result.excavator,
            TIPPERS: result.tippers.join(', '),
            EXPECTED_TRIPS_PER_SHIFT: result.expectedTripsPerShift.toFixed(1),
            EFFICIENCY: `${result.efficiency.toFixed(1)}%`,
            CONFIDENCE: `${result.confidenceScore.toFixed(1)}%`
          }];

          // Format main recommendation as table
         

          answer = `## Optimal Equipment Combination\n\n`;
          answer += `### Recommended Selection\n`;
          answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(mainRecommendation)}<<<JSON_TABLE_DATA>>>`;
          answer += `\n\n**Reasoning:** ${result.reasoning}\n\n`;

          if (result.alternativeCombinations && result.alternativeCombinations.length > 0) {
            const alternativeTableData = result.alternativeCombinations.map((alt: any, i: number) => ({
              '#': i + 1,
              EXCAVATOR: alt.excavator,
              TIPPERS: alt.tippers.join(', '),
              EXPECTED_TRIPS_PER_SHIFT: alt.expectedTrips.toFixed(1),
              EFFICIENCY: `${alt.efficiency.toFixed(1)}%`
            }));
             
            answer += `### Alternative Combinations\n`;
            answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(alternativeTableData)}<<<JSON_TABLE_DATA>>>`;
          }

          answer += `\n\n\n*Recommendation based on historical performance data from your trip records.*`;
        } else if (bestComboMatch) {
          // Default to 1 excavator and 1 tipper for "best pair"
          const result = await optimizeEquipmentSelection(
            1, 
            1, 
            dateFilter,
            { include: includeMatch, exclude: excludeMatch }
          );
          
          // Format main recommendation as table
          const mainRecommendation = [{
            EXCAVATOR: result.excavator,
            TIPPER: result.tippers.join(', '),
            EXPECTED_TRIPS_PER_SHIFT: result.expectedTripsPerShift.toFixed(1),
            EFFICIENCY: `${result.efficiency.toFixed(1)}%`,
            CONFIDENCE: `${result.confidenceScore.toFixed(1)}%`
          }];

           
         

          answer = `## Best Equipment Combination${dateFilter.month ? ` (Month: ${decision.parameters?.month_name})` : ''}\n\n`;
          answer += `### Top Recommendation\n`;
          answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(mainRecommendation)}<<<JSON_TABLE_DATA>>>`;
          answer += `\n\n**Reasoning:** ${result.reasoning}\n\n`;

          if (result.alternativeCombinations && result.alternativeCombinations.length > 0) {
            const alternativeTableData = result.alternativeCombinations.map((alt: any, i: number) => ({
              '#': i + 1,
              EXCAVATOR: alt.excavator,
              TIPPERS: alt.tippers.join(', '),
              EXPECTED_TRIPS_PER_SHIFT: alt.expectedTrips.toFixed(1),
              EFFICIENCY: `${alt.efficiency.toFixed(1)}%`
            }));
             
            answer += `### Alternative Combinations\n`;
            answer += `<<<JSON_TABLE_DATA>>>${JSON.stringify(alternativeTableData)}<<<JSON_TABLE_DATA>>>`;
          }
          
          answer += `\n\n*Based on historical performance data${dateFilter.month ? ` for ${decision.parameters?.month_name}` : ''}.*`;
        } else {
          // Check if we are missing critical information
          if (decision.intent === 'EQUIPMENT_OPTIMIZATION') {
             // If the user just asked "optimize equipment" without specifics, prompt them.
             // Check if we have partial info (e.g. Shift but no Target)
             const hasShift = !!dateFilter.shift;
             const hasVolumeIntent = question.toLowerCase().includes('volume') || question.toLowerCase().includes('m3');
             const hasTonnageIntent = question.toLowerCase().includes('ton') || question.toLowerCase().includes('production');
             
             if (hasShift && (hasVolumeIntent || hasTonnageIntent)) {
                const metric = hasVolumeIntent ? 'Volume (m³)' : 'Tonnage';
                answer = `I see you want to optimize for **Shift ${dateFilter.shift}** based on **${metric}**.\n\n` +
                `Please specify the target amount:\n` +
                `- **"Target 5000 ${hasVolumeIntent ? 'm3' : 'tons'}"**\n` +
                `- **"Mine 10000 ${hasVolumeIntent ? 'm3' : 'tons'}"**`;
             } else {
                answer = "I can help you optimize your mining operations. To give you the best recommendation, please specify:\n\n" +
               "1. **Which shift** are you planning for? (e.g., 'Optimize for Shift A' or 'Optimize for Shift 1')\n" +
                "2. **What is your target?** (e.g., 'Target 5000 tons')\n" +
                "3. **What is the time frame?** (e.g., 'in 3 days', 'in 2 months', 'in 8 hours')\n\n" +
               "For example: *'Optimize equipment for Shift A (Shift 1) to mine 5000 tons in 3 days'*";
             }
          } else {
             answer = "I can help you optimize equipment selection. Please specify:\n" +
            "1. Number of excavators and tippers (e.g., 'Select best 1 excavator and 3 tippers')\n" +
            "2. A production target (e.g., 'Plan for target 5000 tons')\n" +
            "3. A forecast request (e.g., 'Forecast production for next 7 days')";
          }
        }
      } else if (decision.task === 'sql') {
        // annotate template used for LLM-generated SQL (or use existing override)
        if (!decision.template_used) {
          decision.template_used = decision.intent ? `llm_sql_${decision.intent}` : 'llm_sql_generic';
        }
        
        // PHASE 3: Always use generateSQLFromIntent
        // It tries SQL builder first (fast, deterministic), then falls back to LLM if needed
        
        console.log('[App.tsx SQL Gen] Decision intent before SQL generation:', decision.intent);
        console.log('[App.tsx SQL Gen] Decision object:', JSON.stringify(decision, null, 2));
        
        // Check if SQL builder can handle this to track LLM usage
        const { buildSQL } = await import('./router/sqlBuilder');
        const builtSQL = decision.intent && decision.parameters 
          ? buildSQL(decision.intent, decision.parameters, question)
          : null;
        
        if (!builtSQL) {
          // SQL builder couldn't handle it, LLM will be called
          setLlmCallCount(c => {
            const next = c + 1;
            console.log('[LLM COUNTER] generateSQLFromIntent using LLM fallback, new count:', next);
            return next;
          });
        }
        
        sqlQuery = await generateSQLFromIntent(decision, schema, settings, chatHistory);

        const result = await executeSQL(sqlQuery || '');

        if (result.success && result.data) {
          
          // Format results with special markers for proper table rendering
          if (result.data.length > 0) {
            answer = `Query executed successfully.\n\n<<<JSON_TABLE_DATA>>>${JSON.stringify(result.data)}<<<JSON_TABLE_DATA>>>`;
          } else {
            answer = `Query executed successfully.\n\nNo results found.`;
          }
          tokensUsed = result.tokensUsed || 0;
        } else {
          console.error('[App.tsx SQL Execution] Query failed:', result.error);
          answer = `Error executing query: ${result.error}`;
        }
      } else {
        // Check if this is a deterministic data query (no LLM needed)
        if (decision.intent === 'data_query_deterministic') {
          console.log('[App.tsx] Using deterministic data query result (no LLM call)');
          answer = decision.reason; // Answer is already in the reason field
          tokensUsed = 0; // No tokens used
          citations = []; // No citations for deterministic queries
        } else {
          if (!decision.template_used) {
            decision.template_used = decision.intent ? `llm_rag_${decision.intent}` : 'llm_rag_generic';
          }
          // RAG flow likely uses the LLM to synthesize answers; count it.
          setLlmCallCount(c => {
            const next = c + 1;
            console.log('[LLM COUNTER] queryRAG used, new count:', next);
            return next;
          });
          const ragResult = await queryRAG(question, settings, decision.namespaces || ['combined'], chatHistory);
          answer = ragResult.answer;
          citations = ragResult.citations || [];
          tokensUsed = ragResult.tokensUsed;
        }
      }

      const latencyMs = Date.now() - startTime;
      const routeTakenForDb = decision.task === 'optimize' ? 'rag' : decision.task;

      // Optimistically append the message to UI so route_source and latency are visible even if DB insert fails
      const tempId = `local-${Date.now()}`;
      const tempMsg: any = {
        id: tempId,
        user_id: userId,
        question,
        answer,
        route_taken: routeTakenForDb,
        route_source: decision.route_source,
        detected_intent: decision.intent,
        intent_confidence: decision.intent_confidence,
        matched_keywords: decision.intent_keywords,
        parameters: decision.parameters,
        template_used: decision.template_used,
        confidence: decision.confidence,
        manual_override: !!route,
        sql_query: sqlQuery,
        citations: citations.length > 0 ? citations : undefined,
        tokens_used: tokensUsed,
        latency_ms: latencyMs,
        created_at: new Date().toISOString()
      };

      setChatHistory(prev => [...prev, tempMsg]);

      // Store context in quick cache for follow-up detection
      quickContextCache.set(userId, {
        lastIntent: decision.intent || '',
        lastQuestion: question,
        lastAnswer: answer,
        lastParameters: decision.parameters || {},
        routeTaken: routeTakenForDb
      });

      const savedId = await saveChatMessage({
        user_id: userId,
        question,
        answer,
        // Do not write 'optimize' into DB until schema updated; map to 'rag' for now
        route_taken: routeTakenForDb,
        confidence: decision.confidence,
        manual_override: !!route,
        sql_query: sqlQuery,
        citations: citations.length > 0 ? citations : undefined,
        tokens_used: tokensUsed,
        latency_ms: latencyMs
      });

      // Add to report session
      if (savedId && reportSessionId) {
        reportStore.addTurn({
          id: savedId,
          question,
          answer,
          timestamp: new Date().toISOString(),
          route: routeTakenForDb as 'sql' | 'rag' | 'optimize',
          confidence: decision.confidence,
          sql: sqlQuery || undefined,
          citations: citations.length > 0 ? citations : undefined,
          charts: [],
        });
        console.log('[Report] Turn added:', savedId, 'Route:', routeTakenForDb, 'SQL:', !!sqlQuery);
      }

      // Persist route_source in-memory keyed by the DB id so UI can show which routing method was used during this session
      if (savedId && decision.route_source) {
        const newEntry: RouteMeta = {
          route_source: decision.route_source as 'deterministic' | 'llm',
          detected_intent: decision.intent,
          intent_confidence: decision.intent_confidence,
          matched_keywords: decision.intent_keywords,
          parameters: decision.parameters,
          template_used: decision.template_used
        };

        const newMap: Record<string, RouteMeta> = { ...routeSourceMap, [savedId]: newEntry };
        setRouteSourceMap(newMap);
        // immediately reload merging the updated map so the UI shows the route_source for the newly saved message
        await loadData(newMap);
      } else {
        // If save failed, keep the optimistic message (it will persist until next reload)
        if (!savedId) {
          console.warn('saveChatMessage returned null; keeping optimistic message in UI');
        }
        await loadData();
      }
      // Persist route_source in-memory keyed by the DB id so UI can show which routing method was used during this session
      if (savedId && decision.route_source) {
        const newEntry: RouteMeta = {
          route_source: decision.route_source as 'deterministic' | 'llm',
          detected_intent: decision.intent,
          intent_confidence: decision.intent_confidence,
          matched_keywords: decision.intent_keywords,
          parameters: decision.parameters,
          template_used: decision.template_used
        };

        const newMap: Record<string, RouteMeta> = { ...routeSourceMap, [savedId]: newEntry };
        setRouteSourceMap(newMap);
        // immediately reload merging the updated map so the UI shows the route_source for the newly saved message
        await loadData(newMap);
      } else {
        // If save failed, keep the optimistic message (it will persist until next reload)
        if (!savedId) {
          console.warn('saveChatMessage returned null; keeping optimistic message in UI');
        }
        await loadData();
      }
      // Persist route_source in-memory keyed by the DB id so UI can show which routing method was used during this session
      if (savedId && decision.route_source) {
        const newEntry: RouteMeta = {
          route_source: decision.route_source as 'deterministic' | 'llm',
          detected_intent: decision.intent,
          intent_confidence: decision.intent_confidence,
          matched_keywords: decision.intent_keywords,
          parameters: decision.parameters,
          template_used: decision.template_used
        };

        const newMap: Record<string, RouteMeta> = { ...routeSourceMap, [savedId]: newEntry };
        setRouteSourceMap(newMap);
        // immediately reload merging the updated map so the UI shows the route_source for the newly saved message
        await loadData(newMap);
      } else {
        // If save failed, keep the optimistic message (it will persist until next reload)
        if (!savedId) {
          console.warn('saveChatMessage returned null; keeping optimistic message in UI');
        }
        await loadData();
      }
    } catch (error: any) {
      console.error('Error processing message:', error);
      setNotification({ type: 'error', message: error.message || 'An error occurred processing your question.' });
      setTimeout(() => setNotification(null), 5000);

      // Add error message to chat
      const errorMsg: any = {
        id: `error-${Date.now()}`,
        user_id: userId,
        question,
        answer: `**Error:** ${error.message || "I encountered an unexpected error while processing your request."}`,
        route_taken: 'error',
        created_at: new Date().toISOString(),
        isError: true
      };
      setChatHistory(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    const success = await clearChatHistory(userId);
    if (success) {
      setNotification({ type: 'success', message: 'Chat history cleared successfully' });
      setTimeout(() => setNotification(null), 3000);
      await loadData();
    } else {
      setNotification({ type: 'error', message: 'Failed to clear chat history' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleUploadFiles = async (fileList: FileList) => {
    const supabase = getSupabaseClient();
    console.log('Uploading files:', fileList.length);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      console.log('Processing file:', file.name, file.size, 'bytes');

      try {
        const fileExt = file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN';
        const storagePath = `${userId}/${Date.now()}_${file.name}`;

        const { error: storageError } = await supabase.storage
          .from('uploaded-files')
          .upload(storagePath, file);

        if (storageError) {
          console.error('Storage error:', storageError);
          alert(`Failed to upload ${file.name}: ${storageError.message}`);
          continue;
        }

        const { data, error } = await supabase
          .from('uploaded_files')
          .insert({
            user_id: userId,
            filename: file.name,
            file_type: fileExt,
            size_bytes: file.size,
            namespace: `${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`,
            storage_path: storagePath,
            status: 'indexing',
            progress: 0
          })
          .select()
          .single();

        if (error) {
          console.error('Error saving file metadata:', error);
          alert(`Failed to save ${file.name}: ${error.message}`);
        } else if (data) {
          console.log('File uploaded successfully:', data);
          setFiles(prev => [...prev, data]);

          processFile(data.id, file);
        }
      } catch (err: any) {
        console.error('Upload exception:', err);
        alert(`Error uploading ${file.name}: ${err.message}`);
      }
    }

    await loadData();
  };

  const processFile = async (fileId: string, file: File) => {
    const supabase = getSupabaseClient();

    try {
      const content = await readFileContent(file, fileId);

      await supabase
        .from('uploaded_files')
        .update({ progress: 25, status: 'indexing' })
        .eq('id', fileId);

      await loadData();

      if (!settings) {
        throw new Error('Settings not loaded');
      }

      const fileRecord = files.find(f => f.id === fileId) || {
        id: fileId,
        filename: file.name,
        file_type: file.name.split('.').pop()?.toUpperCase() || 'UNKNOWN',
        namespace: `${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`
      } as any;

      let importMessage = '';

      if (fileRecord.file_type === 'CSV' || fileRecord.file_type === 'XLSX') {
        const { importCSVToTable } = await import('./router/services/csvImporter');
        const rows = JSON.parse(content);
        const headers = Object.keys(rows[0] || {});

        const importResult = await importCSVToTable(rows, headers, file.name, userId);

        if (importResult.success) {
          importMessage = `Imported ${importResult.rowsImported} rows to ${importResult.tableName} table. `;
        } else {
          console.warn('CSV import failed:', importResult.error);
        }
      }

      const result = await indexFile(
        fileRecord,
        content,
        settings,
        async (progress: number) => {
          await supabase
            .from('uploaded_files')
            .update({ progress: 25 + Math.floor(progress * 0.75) })
            .eq('id', fileId);

          await loadData();
        }
      );

      if (result.success) {
        await supabase
          .from('uploaded_files')
          .update({
            status: 'ready',
            progress: 100,
            doc_count: result.docCount || 0,
            error_message: importMessage || null
          })
          .eq('id', fileId);
      } else {
        await supabase
          .from('uploaded_files')
          .update({
            status: 'error',
            error_message: result.error || 'Processing failed'
          })
          .eq('id', fileId);
      }

      await loadData();
    } catch (error: any) {
      console.error('Processing error:', error);
      await supabase
        .from('uploaded_files')
        .update({
          status: 'error',
          error_message: error.message
        })
        .eq('id', fileId);

      await loadData();
    }
  };

  const readFileContent = async (file: File, fileId?: string): Promise<string> => {
    const fileType = file.name.split('.').pop()?.toUpperCase();

    if (fileType === 'CSV') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const lines = text.split('\n').filter(l => l.trim());
          const headers = lines[0].split(',').map(h => h.trim());
          const rows = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, idx) => {
              obj[header] = values[idx]?.trim() || '';
              return obj;
            }, {} as any);
          });
          resolve(JSON.stringify(rows));
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    } else if (fileType === 'XLSX') {
      alert('XLSX processing requires additional libraries. For now, please convert to CSV.');
      throw new Error('XLSX not yet supported');
    } else if (fileType === 'PDF') {
      const formData = new FormData();
      formData.append('file', file);
      if (fileId) {
        formData.append('fileId', fileId);
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/extract-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to extract text from PDF');
      }

      const result = await response.json();
      console.log('PDF extraction result:', result);
      return result.text;
    } else if (fileType === 'DOCX') {
      alert('DOCX processing requires additional libraries. For now, please convert to plain text or PDF.');
      throw new Error('DOCX not yet supported');
    } else {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const supabase = getSupabaseClient();
    await supabase.from('uploaded_files').delete().eq('id', fileId);
    loadData();
  };

  const handleSaveSettings = async (newSettings: Partial<RAGSettings>) => {
    const success = await saveUserSettings({ ...newSettings, user_id: userId });
    if (success) {
      setNotification({ type: 'success', message: 'Settings saved successfully!' });
      setTimeout(() => setNotification(null), 3000);
      await loadData();
    } else {
      setNotification({ type: 'error', message: 'Failed to save settings. Please try again.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleClearIndex = async () => {
    if (confirm('Are you sure you want to clear all indexes? This cannot be undone.')) {
      await clearAllIndexes(userId);
      loadData();
    }
  };

  const handleRebuildIndex = async () => {
    alert('Rebuild index functionality will process all files again with current settings.');
  };

  const handleIndexProduction = async (tableName: string, ragSettings: RAGSettings) => {
    try {
      const { indexDatabaseTableToRAG } = await import('./utils/ragIndexer');
      const result = await indexDatabaseTableToRAG(
        tableName,
        ragSettings,
        async (message, progress) => {
          console.log(`[${progress}%] ${message}`);
          await loadData();
        }
      );

      if (result.success) {
        setNotification({
          type: 'success',
          message: result.message
        });
        setTimeout(() => setNotification(null), 5000);
        await loadData();
      } else {
        setNotification({
          type: 'error',
          message: result.message
        });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (error: any) {
      console.error('Error indexing production data:', error);
      setNotification({
        type: 'error',
        message: error.message || 'Failed to index production data'
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const handleSelectHistory = (_message: ChatMessage) => {
    // Not needed for now, but keeping the function signature
    // Function intentionally left empty for future use
    setActiveTab('chat');
  };

  const handleCannedQuestion = (question: string) => {
    setActiveTab('chat');
    handleSendMessage(question);
  };

  const handleGenerateReport = async () => {
    console.log('[Report] Export button clicked');
    console.log('[Report] Current reportSessionId:', reportSessionId);
    console.log('[Report] Session from store before end:', reportStore.getSession());
    
    const session = reportStore.endSession();
    
    console.log('[Report] Session after endSession():', session);
    
    if (!session) {
      setNotification({ type: 'error', message: 'No report session active' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      console.log('[Report] Session object:', JSON.stringify(session, null, 2));
      console.log('[Report] Turns count:', session.turns?.length ?? 'undefined');
      
      const { buildMarkdown } = await import('./user_services/reporting/reportAssembler');
      const { downloadBlob } = await import('./user_services/reporting/reportExporter');
      
      const markdown = buildMarkdown(session);
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const filename = `Mining_Report_${new Date().toISOString().split('T')[0]}.md`;
      downloadBlob(blob, filename);
      
      setNotification({ type: 'success', message: `Report exported: ${filename}` });
      setTimeout(() => setNotification(null), 3000);
      
      console.log('[Report] Exported:', filename, 'Turns:', session.turns?.length ?? 0);
      
      // Restart session for continued use
      const newSessionId = `session_${Date.now()}_${userId.slice(0, 8)}`;
      reportStore.startSession(newSessionId, userId);
      setReportSessionId(newSessionId);
    } catch (error: any) {
      console.error('[Report] Export failed:', error);
      setNotification({ type: 'error', message: `Failed to export report: ${error.message}` });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Removed unused handleSummarizeReport function

  const tabs = [
    { id: 'chat' as Tab, label: 'Chat', icon: MessageSquare },
    { id: 'settings' as Tab, label: 'Settings', icon: Settings }
  ];

  return (
    <div className="flex h-screen bg-white">
      <SummaryModal
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        summary={summaryText}
        onExport={handleExportSummary}
        isGenerating={isSummarizing}
      />
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          notification.type === 'success'
            ? 'bg-blue-600 text-white dark:bg-blue-700'
            : 'bg-red-600 text-white dark:bg-mining-red'
        }`}>
          {notification.type === 'success' ? '✓' : '✕'}
          <span>{notification.message}</span>
        </div>
      )}

      {isSidebarOpen && (
        <Sidebar
          chatHistory={chatHistory}
          onSelectHistory={handleSelectHistory}
          onCannedQuestion={handleCannedQuestion}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}

      <div className="flex-1 flex flex-col">
        <div className="border-b border-slate-200 dark:border-mining-border bg-white dark:bg-mining-surface">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="px-4 py-4 text-slate-600 dark:text-mining-text-secondary hover:text-blue-600 dark:hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-mining-surface transition-colors"
              title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                        : 'border-transparent text-slate-600 dark:text-mining-text-secondary hover:text-blue-600 dark:hover:text-blue-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="px-4 flex items-center gap-4">
              <div className="text-sm text-slate-600 dark:text-mining-text-secondary">LLM calls: <span className="font-semibold text-slate-900 dark:text-mining-text">{llmCallCount}</span></div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'chat' && (
            <ChatTab
              onSendMessage={handleSendMessage}
              onClearHistory={handleClearHistory}
              onSummarize={handleSummarize}
              onExportLog={handleGenerateReport}
              isLoading={isLoading}
              chatHistory={chatHistory}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings}
              files={files}
              onSave={handleSaveSettings}
              onClearIndex={handleClearIndex}
              onRebuildIndex={handleRebuildIndex}
              onUpload={handleUploadFiles}
              onDelete={handleDeleteFile}
              onIndexProduction={handleIndexProduction}
            />
          )}
        </div>
      </div>
    </div>
  );
}