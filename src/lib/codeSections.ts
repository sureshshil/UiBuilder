/**
 * codeSections.ts
 *
 * Robust structured code handling.
 *
 * The AI is instructed to output code with three sentinel comment markers:
 *   // @@logic   – state, effects, handlers, helper functions
 *   // @@styles  – all style objects (const S = { ... })
 *   // @@jsx     – the return ( ... ) JSX block
 *
 * Splitting is a simple string split on these markers — no regex on code,
 * no AST required for this step. The AI owns the sectioning.
 *
 * Babel AST is used only for the optional skeleton summary (safe fallback if it fails).
 */

export interface CodeSections {
  logic: string;
  styles: string;
  jsx: string;
  /** Compact structural summary, always-on context for the AI. Empty string if unavailable. */
  skeleton: string;
  /** True if all three section markers were found (structured output). False = legacy plain code. */
  isStructured: boolean;
}

const MARKER = {
  logic: '// @@logic',
  styles: '// @@styles',
  jsx: '// @@jsx',
} as const;

// ─── Split ────────────────────────────────────────────────────────────────────

/**
 * Split code that the AI generated in structured format into named sections.
 * If the markers are absent (e.g. first-generation legacy code), returns the
 * full code under `logic` and marks `isStructured: false` so callers can
 * gracefully fall back to sending the full code.
 */
export function splitSections(code: string): CodeSections {
  const hasLogic = code.includes(MARKER.logic);
  const hasStyles = code.includes(MARKER.styles);
  const hasJsx = code.includes(MARKER.jsx);

  // If ANY marker exists, treat it as structured. AI might omit an empty section.
  const isStructured = hasLogic || hasStyles || hasJsx;

  if (!isStructured) {
    return {
      logic: code,
      styles: '',
      jsx: '',
      skeleton: buildSkeleton(code),
      isStructured: false,
    };
  }

  // Split safely regardless of which markers are present
  let currentSection: 'none' | 'logic' | 'styles' | 'jsx' = 'none';
  const buffers = { logic: '', styles: '', jsx: '' };

  const lines = code.split('\n');
  for (const line of lines) {
    if (line.trim() === MARKER.logic) {
      currentSection = 'logic';
      continue;
    }
    if (line.trim() === MARKER.styles) {
      currentSection = 'styles';
      continue;
    }
    if (line.trim() === MARKER.jsx) {
      currentSection = 'jsx';
      continue;
    }

    if (currentSection !== 'none') {
      buffers[currentSection] += line + '\n';
    } else {
      // If it's legacy code (no markers), EVERYTHING goes into logic
      if (!isStructured) {
        buffers.logic += line + '\n';
      }
      // If it IS structured, we discard text before the first marker 
      // (to ignore conversational AI text like "Here is your code:")
    }
  }

  return {
    logic: buffers.logic.trim(),
    styles: buffers.styles.trim(),
    jsx: buffers.jsx.trim(),
    skeleton: buildSkeleton(code),
    isStructured: true,
  };
}

// ─── Merge ────────────────────────────────────────────────────────────────────

/**
 * Reassemble the full component from sections for context/storage.
 * Keeps the @@markers so future splitSections() calls work.
 */
export function mergeSections(sections: CodeSections): string {
  if (!sections.isStructured) return sections.logic; // was plain code, return as-is

  return [
    MARKER.logic,
    sections.logic,
    '',
    MARKER.styles,
    sections.styles,
    '',
    MARKER.jsx,
    sections.jsx,
  ]
    .join('\n')
    .trim();
}

/**
 * Convert sections into a complete, executable JavaScript component
 * that browser Babel can parse and render.
 *
 * Structured output:
 *   function App() {
 *     [logic — state, handlers, helpers]
 *     [styles — const S = { ... }]
 *     [jsx — return ( ... )]
 *   }
 *   export default App;
 *
 * Unstructured (legacy plain code): returned as-is.
 */
export function toPreviewCode(sections: CodeSections): string {
  if (!sections.isStructured) {
    // Legacy plain code — already a complete component, return unchanged
    return sections.logic;
  }

  // Assemble into a valid JS function body, stripping the @@markers
  return `function App() {
${sections.logic}

${sections.styles}

${sections.jsx}
}
export default App;`.trim();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

/**
 * Build a compact structural summary of the component for use as always-on
 * context. Uses simple heuristics that are safe on any valid/invalid code —
 * no exceptions propagate to the caller.
 *
 * Example output:
 *   COMPONENT: App
 *   STATE: count(number), theme(string), isOpen(boolean)
 *   HANDLERS: handleClick, handleTheme, handleSubmit
 *   JSX: div > [header > [h1, button×2], main > [Card×3], footer]
 */
export function buildSkeleton(code: string): string {
  try {
    const lines = code.split('\n');

    // Extract useState variable names
    const stateVars: string[] = [];
    for (const line of lines) {
      const m = line.match(/const\s+\[(\w+)/);
      if (m && line.includes('useState')) stateVars.push(m[1]);
    }

    // Extract handler / function names
    const handlers: string[] = [];
    for (const line of lines) {
      const m = line.match(/const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
      if (m && !line.includes('useState') && !m[1].startsWith('S')) {
        handlers.push(m[1]);
      }
      const m2 = line.match(/function\s+(\w+)\s*\(/);
      if (m2 && m2[1] !== 'App') handlers.push(m2[1]);
    }

    // Extract JSX element names from the return block (first-level only)
    const jsxTags: string[] = [];
    const returnIdx = lines.findIndex(l => l.trim().startsWith('return'));
    if (returnIdx !== -1) {
      const returnBlock = lines.slice(returnIdx, returnIdx + 50).join('\n');
      const tagMatches = returnBlock.matchAll(/<([A-Za-z][A-Za-z0-9.]*)/g);
      const seen = new Set<string>();
      for (const t of tagMatches) {
        if (!seen.has(t[1]) && t[1] !== 'React') {
          seen.add(t[1]);
          jsxTags.push(t[1]);
        }
      }
    }

    const parts: string[] = ['COMPONENT: App'];
    if (stateVars.length) parts.push(`STATE: ${stateVars.join(', ')}`);
    if (handlers.length) parts.push(`HANDLERS: ${[...new Set(handlers)].join(', ')}`);
    if (jsxTags.length) parts.push(`ELEMENTS: ${jsxTags.slice(0, 12).join(', ')}`);

    return parts.join('\n');
  } catch {
    // Never crash — skeleton is optional enrichment, not critical
    return '';
  }
}
