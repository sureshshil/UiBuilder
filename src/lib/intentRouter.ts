/**
 * intentRouter.ts
 *
 * Classifies a user's prompt into one or more intent categories and
 * builds the minimal API payload needed for each intent.
 *
 * Design goals:
 *  - Fast: pure string ops, no network calls, runs synchronously
 *  - Safe: unknown/ambiguous prompts → full context (never under-inform the AI)
 *  - Flat: token cost never grows with conversation length
 */

import { CodeSections, mergeSections } from './codeSections';

// ─── Intent types ─────────────────────────────────────────────────────────────

export type Intent = 'style' | 'structure' | 'logic' | 'full';

// ─── Keyword maps ─────────────────────────────────────────────────────────────

const STYLE_KEYWORDS = new Set([
  'color', 'colour', 'dark', 'light', 'theme', 'background', 'bg',
  'font', 'size', 'border', 'shadow', 'gradient', 'style', 'styled',
  'padding', 'margin', 'spacing', 'layout', 'radius', 'rounded',
  'opacity', 'transparent', 'visible', 'animation', 'transition',
  'hover', 'glow', 'blur', 'glass', 'glassmorphism', 'neon',
  'width', 'height', 'bold', 'italic', 'underline', 'center', 'align',
]);

const STRUCTURE_KEYWORDS = new Set([
  'add', 'remove', 'delete', 'new', 'create', 'insert', 'replace',
  'button', 'input', 'form', 'field', 'modal', 'dialog', 'dropdown',
  'menu', 'nav', 'header', 'footer', 'sidebar', 'card', 'section',
  'column', 'row', 'grid', 'table', 'list', 'item', 'tab', 'accordion',
  'chart', 'graph', 'image', 'icon', 'badge', 'avatar', 'tooltip',
  'breadcrumb', 'pagination', 'search', 'filter', 'sort',
]);

const LOGIC_KEYWORDS = new Set([
  'click', 'submit', 'state', 'handler', 'effect', 'fetch', 'api',
  'async', 'await', 'promise', 'data', 'load', 'save', 'update',
  'toggle', 'count', 'increment', 'decrement', 'validate', 'error',
  'success', 'loading', 'callback', 'event', 'function', 'logic',
  'sort', 'filter', 'search', 'map', 'reduce', 'store', 'memo',
  'ref', 'focus', 'scroll', 'resize', 'interval', 'timeout',
]);

// ─── Detect intent ────────────────────────────────────────────────────────────

/**
 * Tokenise the prompt (lowercase words) and match against keyword sets.
 * Returns an array of matched intents, or ['full'] if ambiguous/unknown.
 */
export function detectIntent(prompt: string): Intent[] {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const intents = new Set<Intent>();
  for (const word of words) {
    if (STYLE_KEYWORDS.has(word)) intents.add('style');
    if (STRUCTURE_KEYWORDS.has(word)) intents.add('structure');
    if (LOGIC_KEYWORDS.has(word)) intents.add('logic');
  }

  // If nothing matched, or the request seems broad (many intents at once),
  // fall back to full context — never risk under-informing the AI.
  if (intents.size === 0 || intents.size >= 3) return ['full'];

  return [...intents];
}

// ─── Build API payload ────────────────────────────────────────────────────────

export interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Build the minimal, intent-routed context payload for the API call.
 *
 * Payload structure:
 *  1. [skeleton]  — always included if available (~30-50 tokens)
 *  2. [sections]  — only the sections relevant to the detected intent
 *  3. [recent user messages] — last N user instructions (text only)
 *
 * Falls back to full code if:
 *  - intent is 'full'
 *  - the code is not yet in structured format (isStructured: false)
 *  - sections is null (no code exists yet)
 */
export function buildApiPayload(
  sections: CodeSections | null,
  prompt: string,
  recentUserMessages: ApiMessage[],
  maxUserMessages = 6,
): ApiMessage[] {
  const payload: ApiMessage[] = [];

  if (sections) {
    const intents = detectIntent(prompt);
    const isFull = intents.includes('full') || !sections.isStructured;

    if (isFull) {
      // Full code as single assistant context block
      const fullCode = mergeSections(sections);
      if (fullCode) payload.push({ role: 'assistant', content: fullCode });
    } else {
      // Skeleton always first
      if (sections.skeleton) {
        payload.push({
          role: 'assistant',
          content: `COMPONENT STRUCTURE:\n${sections.skeleton}`,
        });
      }

      // Only the relevant sections
      const sectionParts: string[] = [];

      if (intents.includes('logic') && sections.logic) {
        sectionParts.push(`// @@logic\n${sections.logic}`);
      }
      if (intents.includes('style') && sections.styles) {
        sectionParts.push(`// @@styles\n${sections.styles}`);
      }
      if (intents.includes('structure') && sections.jsx) {
        // structure changes need the JSX + logic (to know what state/handlers exist)
        if (!sectionParts.some(p => p.startsWith('// @@logic')) && sections.logic) {
          sectionParts.push(`// @@logic\n${sections.logic}`);
        }
        sectionParts.push(`// @@jsx\n${sections.jsx}`);
      }

      if (sectionParts.length > 0) {
        payload.push({ role: 'assistant', content: sectionParts.join('\n\n') });
      } else {
        // Safety fallback — should not happen, but never leave the AI context-free
        payload.push({ role: 'assistant', content: mergeSections(sections) });
      }
    }
  }

  // Merge recent user instructions into a single user message to prevent
  // consecutive user roles from crashing the Gemini API
  const capped = recentUserMessages.slice(-maxUserMessages);
  let finalPrompt = '';
  if (capped.length > 0) {
    finalPrompt += "Previous requests for context:\n";
    finalPrompt += capped.map((m, i) => `- ${m.content}`).join('\n');
    finalPrompt += "\n\nNew request:\n";
  }
  finalPrompt += prompt;

  payload.push({ role: 'user', content: finalPrompt });

  return payload;
}
