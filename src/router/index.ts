/**
 * Router Module - Main Entry Point
 * 
 * This is the refactored, modular router system.
 * 
 * Architecture:
 * - ruleRouter.ts: Deterministic rule-based routing (Priority 0-7)
 * - fallbackRouter.ts: Catch-all heuristic patterns (Priority 8)
 * - tableRouter.ts: Determines which DB table(s) to query
 * - llmRouter.ts: LLM-based routing when deterministic fails
 * - helpers/: Utility functions (dates, SQL, patterns, debug, thresholds)
 * - prompts/: LLM prompt templates (routerRules, sqlGenerationRules)
 * 
 * Flow:
 * 1. Normalize intent (intent.ts)
 * 2. Detect query type (detectQueryType.ts)
 * 3. Try rule-based routing (ruleRouter.ts)
 * 4. If no match, try fallback patterns (fallbackRouter.ts)
 * 5. If confidence too low, call LLM (llmRouter.ts)
 * 6. Attach metadata (intent, params, query_type)
 * 7. Return decision
 */

import type { RouterDecision, RAGSettings, ChatMessage } from '../types';
import { normalizeUserQuery } from './services/intent';
import { detectQueryType } from './detectQueryType';
import { ruleRoute } from './ruleRouter';
import { fallbackRoute } from './fallbackRouter';
import { llmRoute } from './llmRouter';
import { debugIntent, debugDecision, debugParameters } from './helpers/debug';
import { THRESHOLDS } from './helpers/thresholds';
import { generateCorrelationId } from '../utils/correlationId';
import { logFailure, logRoute } from '../utils/simpleLogger';
import { detectFollowUp, mergeFollowUpParameters, extractFollowUpConstraints, resolveFollowUpWithLLM } from './services/followUpDetector';
import { quickContextCache } from './services/quickContextCache';
import { selectIntentWithLLM, shouldUseLLMForIntent } from './services/hybridIntentSelector';
import { getSupabaseClient } from '../utils/supabase';
import { handleDataQuery, canHandleDeterministically } from './services/dataQueryHandler';

 

const supabase = getSupabaseClient();

/**
 * Main routing function
 * Routes a user question to SQL, RAG, or Optimize task
 * 
 * @param question - User's question
 * @param schema - Database schema (optional)
 * @param settings - RAG settings (optional)
 * @param chatHistory - Recent chat history for follow-up detection (optional)
 * @param userId - User ID for context caching (optional)
 */
export async function routeQuestion(
  question: string,
  schema?: any,
  settings?: RAGSettings,
  chatHistory?: ChatMessage[],
  userId?: string
): Promise<RouterDecision> {
  const correlationId = generateCorrelationId();
  const startTime = performance.now();
  let llmUsedForFollowUp = false;
  
  try {
    // ✅ PRIORITY 0: File-specific queries must be handled FIRST to prevent cross-contamination
    // This runs BEFORE any other routing logic
    const mentionsFile = /\b(?:csv|xlsx|xls|test|shopping|updated|data|spotify|analysis|dataset|file|uploaded)\b/i.test(question);
    
    if (mentionsFile && settings) {
      console.log('[Router] 🔍 Detected file-related query, checking for specific file mention...');
      
      // Fetch uploaded files to find the target
      const { data: files, error } = await supabase
        .from('uploaded_files')
        .select('namespace, filename, created_at')
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && files && files.length > 0) {
        console.log('[Router] 📁 Available files:', files.map(f => f.filename));
        
        // STRICT filename matching with word boundaries to prevent cross-contamination
        const mentionedFile = files.find(f => {
          const queryLower = question.toLowerCase();
          const filenameLower = f.filename.toLowerCase();
          const baseFilename = filenameLower.replace(/\.(csv|xlsx|xls|txt|pdf)$/i, '');
          
          console.log(`[Router] 🔎 Checking: "${f.filename}"`);
          
          // Strategy 1: Exact filename match (e.g., "shopping_behavior_updated.csv")
          const exactMatch = new RegExp(`\\b${filenameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (exactMatch.test(queryLower)) {
            console.log(`[Router] ✅ EXACT match: "${f.filename}"`);
            return true;
          }
          
          // Strategy 2: Exact base filename match (e.g., "shopping_behavior_updated")
          const baseMatch = new RegExp(`\\b${baseFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (baseMatch.test(queryLower)) {
            console.log(`[Router] ✅ BASE match: "${f.filename}"`);
            return true;
          }
          
          // Strategy 3: Single significant word matching - if ANY unique filename word appears, it's a match
          // Split filename by separators, keep words >= 4 chars (filter out common words)
          const filenameWords = baseFilename.split(/[_\s-]+/).filter((w: string) => w.length >= 4);
          
          if (filenameWords.length >= 1) {
            // Check if ANY filename word appears in query (word boundary match)
            for (const word of filenameWords) {
              const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
              
              if (wordRegex.test(queryLower)) {
                console.log(`[Router] ✅ WORD match: "${f.filename}" (matched word: "${word}")`);
                return true;
              }
            }
          }
          
          console.log(`[Router] ❌ No match for: "${f.filename}"`);
          return false;
        });

        if (mentionedFile) {
          console.log('[Router] 🎯 LOCKED onto specific file:', mentionedFile.filename);
          console.log('[Router] 🔒 Namespace:', mentionedFile.namespace);
          
          // Check if this is a deterministic data query (count/filter)
          const isCountQuery = /how many|count|number of/i.test(question);
          
          if (isCountQuery && canHandleDeterministically(question)) {
            console.log('[Router] 🔢 Deterministic count query detected');
            const dataResult = await handleDataQuery(question, mentionedFile.namespace);
            
            if (dataResult.handled) {
              console.log('[Router] ✅ Query handled deterministically!');
              const latency = performance.now() - startTime;
              
              logRoute({
                correlationId,
                question: question.substring(0, 100),
                intent: 'data_query_deterministic',
                confidence: 1.0,
                task: 'rag',
                latency_ms: latency,
              });

              return {
                task: 'rag',
                confidence: 1.0,
                reason: dataResult.answer,
                intent: 'data_query_deterministic',
                intent_confidence: 1.0,
                intent_keywords: ['data', 'count', 'filter'],
                parameters: dataResult.data || {},
                route_source: 'deterministic'
              };
            }
          }
          
          // For ALL other queries on specific files (show rows, summarize, etc.)
          // Route to RAG with ONLY this file's namespace
          console.log('[Router] 📋 Routing to RAG with EXCLUSIVE namespace:', mentionedFile.namespace);
          
          // Don't call queryRAG here - just return the decision
          // App.tsx will call queryRAG with the namespace from parameters
          const latency = performance.now() - startTime;
          
          logRoute({
            correlationId,
            question: question.substring(0, 100),
            intent: 'file_specific_query',
            confidence: 0.95,
            task: 'rag',
            latency_ms: latency,
          });

          return {
            task: 'rag' as const,
            confidence: 0.95,
            reason: `File-specific query routed to RAG (file: ${mentionedFile.filename})`,
            namespaces: [mentionedFile.namespace], // App.tsx will use this
            intent: 'file_specific_query',
            intent_confidence: 0.95,
            intent_keywords: ['file', 'uploaded', 'dataset'],
            parameters: { 
              file: mentionedFile.filename,
              namespace: mentionedFile.namespace 
            },
            route_source: 'deterministic' as const
          };
        } else {
          console.log('[Router] ⚠️ No specific file matched, will continue to general routing');
        }
      }
    }

    // Step 0: Check for follow-up questions
    let followUpContext = null;
    if (chatHistory && chatHistory.length > 0) {
      followUpContext = detectFollowUp(question, chatHistory);

      // If chat history exists but does not carry structured parameters (common when history
      // comes from DB), fall back to quick in-memory context so follow-ups inherit target/duration.
      if (followUpContext?.isFollowUp && userId) {
        const quickContext = quickContextCache.get(userId);
        const prevParams = followUpContext.previousParameters;
        const prevParamsEmpty = !prevParams || (typeof prevParams === 'object' && Object.keys(prevParams).length === 0);

        if ((prevParamsEmpty || !followUpContext.previousIntent) && quickContext) {
          if (!followUpContext.previousIntent && quickContext.lastIntent) {
            followUpContext.previousIntent = quickContext.lastIntent;
          }
          if (prevParamsEmpty && quickContext.lastParameters) {
            followUpContext.previousParameters = quickContext.lastParameters;
          }
          console.log('[Router] Follow-up used quick context fallback:', {
            hasIntent: !!followUpContext.previousIntent,
            hasParams: !!followUpContext.previousParameters
          });
        }
      }
      
      // If follow-up is detected but confidence is not super high, OR if it's a complex modification
      // Use LLM to resolve the context (as requested by user)
      if (followUpContext.isFollowUp && settings?.openai_api_key) {
        console.log('[Router] Follow-up detected, resolving with LLM for precision...');
        const llmResolution = await resolveFollowUpWithLLM(question, chatHistory, settings.openai_api_key);
        
        if (llmResolution.confidence > 0.7) {
          console.log('[Router] LLM resolved follow-up:', llmResolution);
          followUpContext.previousIntent = llmResolution.intent;

          // LLM is *supposed* to return a complete merged set, but in practice it can omit
          // fields like duration/target. Preserve any cached/previous fields.
          if (userId) {
            const quickContext = quickContextCache.get(userId);
            followUpContext.previousParameters = mergeFollowUpParameters(
              llmResolution.parameters || {},
              quickContext?.lastParameters || followUpContext.previousParameters
            );
          } else {
            followUpContext.previousParameters = llmResolution.parameters;
          }
          followUpContext.confidence = llmResolution.confidence;
          llmUsedForFollowUp = true;
        }
      }
      
      if (followUpContext.isFollowUp) {
        console.log('[Router] Follow-up detected:', {
          type: followUpContext.followUpType,
          confidence: followUpContext.confidence,
          previousIntent: followUpContext.previousIntent
        });
      }
    } else if (userId) {
      // Try quick context cache if no chat history provided
      const quickContext = quickContextCache.get(userId);
      if (quickContext) {
        const age = Date.now() - quickContext.timestamp;
        console.log(`[Router] Quick context found (age: ${age}ms)`);
        
        // Simulate follow-up detection from quick context
        const isFollowUp = /^(and|but|what if|what about|with only|instead)/i.test(question);
        if (isFollowUp) {
          followUpContext = {
            isFollowUp: true,
            previousIntent: quickContext.lastIntent,
            previousQuestion: quickContext.lastQuestion,
            previousParameters: quickContext.lastParameters,
            followUpType: 'modification' as const,
            confidence: 0.8
          };
          console.log('[Router] Follow-up detected from quick context');
        }
      }
    }
    
    // Step 1: Normalize intent and extract parameters
    const intentInfo = normalizeUserQuery(question);
    
    // Step 1.5: Check for follow-up questions and merge context BEFORE hybrid selection
    // This ensures we don't waste LLM calls on follow-ups that inherit high confidence
    if (followUpContext?.isFollowUp && followUpContext.previousIntent) {
      const originalIntent = intentInfo.intent;
      const originalConfidence = intentInfo.confidence;
      
      // Inherit previous intent
      intentInfo.intent = followUpContext.previousIntent;
      intentInfo.confidence = Math.max(intentInfo.confidence, 0.8); // Boost confidence
      
      // Extract new constraints from follow-up
      const followUpConstraints = extractFollowUpConstraints(question);
      
      // Merge parameters
      // If LLM was used, previousParameters already contains the full merged set
      // If not, we merge manually
      if (llmUsedForFollowUp) {
         intentInfo.parameters = followUpContext.previousParameters || {};
      } else {
        intentInfo.parameters = mergeFollowUpParameters(
          { ...intentInfo.parameters, ...followUpConstraints },
          followUpContext.previousParameters
        );
      }
      
      console.log('[Router] Intent inherited from follow-up:', {
        original: originalIntent,
        inherited: intentInfo.intent,
        originalConfidence,
        newConfidence: intentInfo.confidence,
        mergedParams: intentInfo.parameters
      });
    }
    
    debugIntent(intentInfo);
    debugParameters(intentInfo.parameters);

    // Step 1.6: Hybrid Intent Selection - Use LLM if rule-based confidence is low
    let finalIntent = intentInfo;
    if (shouldUseLLMForIntent(intentInfo) && settings?.openai_api_key) {
      console.log(`[Hybrid Intent] Low confidence (${intentInfo.confidence.toFixed(2)}) - calling LLM for intent selection...`);
      finalIntent = await selectIntentWithLLM(question, intentInfo, settings);
      console.log(`[Hybrid Intent] Intent: ${intentInfo.intent} → ${finalIntent.intent} (confidence: ${intentInfo.confidence.toFixed(2)} → ${finalIntent.confidence.toFixed(2)})`);
    }
    
    // Step 2: Detect query type for template selection
    const queryType = detectQueryType(question);
    
    // Step 4: Try rule-based deterministic routing
    let decision = ruleRoute(question, finalIntent);
    
    console.log('[Router Debug] Rule-based decision:', {
      task: decision?.task,
      intent: decision?.intent,
      confidence: decision?.confidence,
      finalIntentUsed: finalIntent.intent
    });
    
    // Step 5: If no rule matched, use fallback heuristics
    if (!decision) {
      decision = fallbackRoute(question);
      console.log('[Router Debug] Fallback decision:', {
        task: decision.task,
        intent: decision.intent,
        confidence: decision.confidence
      });
    }
    
    // Step 6: Only call LLM for very low confidence cases (< 0.6)
    // Most queries should be handled deterministically
    if (decision.confidence < THRESHOLDS.MEDIUM && schema && settings?.openai_api_key) {
      console.log(`[Router] Very low confidence (${decision.confidence.toFixed(2)}), calling LLM for routing...`);
      decision = await llmRoute(question, finalIntent, schema, settings);
    } else if (decision.confidence < THRESHOLDS.HIGH) {
      // Log medium confidence but proceed with deterministic decision
      console.log(`[Router] Medium confidence (${decision.confidence.toFixed(2)}), using deterministic routing`);
    }
    
    // Log low-confidence queries to file for review
    if (decision.confidence < THRESHOLDS.MEDIUM) {
      logFailure({
        correlationId,
        question: question.substring(0, 200), // First 200 chars
        intent: finalIntent.intent,
        confidence: decision.confidence,
      });
    }
    
    // Step 7: Attach metadata
    // Preserve intent set by ruleRouter for statistical queries
    if (!decision.statisticalTemplate) {
      decision.intent = finalIntent.intent;
    }
    decision.intent_confidence = finalIntent.confidence;
    decision.intent_keywords = finalIntent.matched_keywords;
    // CRITICAL: Merge parameters instead of overwriting to preserve router-added data like statisticalTemplate
    decision.parameters = {
      ...decision.parameters,  // Preserve router-set parameters (e.g., statisticalTemplate)
      ...finalIntent.parameters  // Add/override with intent-extracted parameters
    };
    (decision as any).query_type = queryType;
    (decision as any).correlation_id = correlationId; // Attach for debugging
    
    debugDecision(decision);
    
    // Log successful route
    const latency = performance.now() - startTime;
    logRoute({
      correlationId,
      question: question.substring(0, 100),
      intent: intentInfo.intent,
      confidence: decision.confidence,
      task: decision.task,
      latency_ms: latency,
    });
    
    return decision;
    
  } catch (error) {
    // Log error with correlation ID for debugging
    logFailure({
      correlationId,
      question: question.substring(0, 200),
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    // Include correlation ID in error message for user reporting
    throw new Error(`[${correlationId}] Router error: ${(error as Error).message}`);
  }
}

// Re-export SQL generation function from llmRouter
export { generateSQLFromIntent } from './llmRouter';