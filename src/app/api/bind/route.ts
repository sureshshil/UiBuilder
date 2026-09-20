import { createVertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { instruction, contracts, schema, currentCode } = await req.json();

    const vertexProvider = createVertex({
      project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT,
      location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
    });

    const systemPrompt = `You are an expert React developer specializing in data binding.
Your task is to connect an uploaded data source (CSV/JSON schema) to an existing UI component.

You will be provided:
1. The uploaded data schema.
2. The user's instruction.
3. The available UI components that can accept data (their interfaces).
4. The current complete React code.

INSTRUCTIONS:
1. Determine WHICH component the user wants to bind to based on their instruction and the available contracts.
2. Compare the uploaded data's actual columns to that component's expected fields (its props interface).
   - COMPATIBLE SCHEMA (fields correspond in meaning, even if named differently — e.g. "cost" means "price", "qty" means "units"): DO NOT modify the original UI component file! Leave it exactly as it is. Create a new Wrapper/Adapter component (e.g., in \`/App.tsx\` or a new file) that parses the raw uploaded data, safely maps it to the precise TypeScript interface required by the chosen component, and renders the original component with the mapped data as props.
   - MISMATCHED SCHEMA (the uploaded columns don't meaningfully correspond to the component's fields — e.g. binding employee records onto a product table): Do NOT force the real values into wrong labels, do NOT invent a fake correspondence, and do NOT drop uploaded fields just to fit the old shape. Instead, UPDATE the original component's fields/column headers/TypeScript interface so they truthfully reflect the REAL uploaded schema, while preserving its visual style exactly (same colors, spacing, theme, layout pattern, animations, component library usage). Then wire the real data into those corrected fields via an adapter as above. The result must be an honest, sensibly-labeled display of the actual data wearing the original design — never a technically-wired but misleading one.
3. SAFEGUARDS: Uploaded CSV/JSON data often contains null, undefined, or empty cells. When mapping data, ALWAYS use fallbacks for string operations (e.g., \`(row.tags || '').split(',')\`) and ensure numbers are safely parsed.
4. Output the updated files using XML-style tags. You must output the ENTIRE content of ANY file you modify (including the original component's file if you had to correct its fields for a mismatched schema). DO NOT output files that you did not modify.

- CRITICAL DATA LOADING RULES (DO NOT HARDCODE DATA):
- The uploaded file sits next to /App.tsx in the sandbox. Load it at runtime — do NOT hardcode mock data arrays, and do NOT fetch a plain path like \`fetch('/exact_filename.ext')\` (that will NOT work).
- Instead, import the file as a URL using a default import: \`import dataUrl from './exact_filename_from_schema.ext';\` (use the exact "filename" from the [Uploaded Data]/schema). Then inside a \`useEffect\`, do \`fetch(dataUrl)\`.
- If it is a JSON file, use \`.then(res => res.json())\` and store it in state.
- If it is a CSV/TSV file, use \`.then(res => res.text())\`, then parse the string using \`papaparse\` (\`Papa.parse(text, { header: true }).data\`), and store it in state.

CRITICAL JS SCOPING RULES:
- Do NOT output \`/styles.css\` unless you absolutely must modify it.
- Do NOT use \`@import\` or \`@apply\` in CSS files (it crashes the Sandpack compiler). Use inline Tailwind utility classes only.
- CRITICAL AVOID TEMPORAL DEAD ZONE (TDZ) ERRORS: Never reference a 'const' or 'let' variable inside its own initialization block. For example, if you need to compute derived elements based on a base array, do not combine them in a single 'const arr = [...base, ...compute(arr)]' definition. Always separate the base definition from the derived computation to avoid 'ReferenceError: Cannot access variable before initialization'. This applies to arrays, objects, and React state initializers.
- PRODUCTION-READY ROBUSTNESS: Your generated UIs must be bulletproof. Layouts must gracefully handle massive dynamic datasets without overlapping, spilling, or breaking bounds.
- FLAWLESS EXECUTION: Any advanced interactions (3D effects, animations, complex layering) must be executed perfectly without visual glitches or weird artifacts.

CRITICAL OUTPUT FORMAT:
<file path="/App.tsx">
// the entire updated code here
</file>

Do NOT output markdown blocks (\`\`\`). Do NOT change the visual style (colors, spacing, theme, animations, overall layout pattern) of the UI. You MAY adjust field/column labels and the TypeScript interface if the uploaded schema doesn't match the original mock fields — see the MISMATCHED SCHEMA case in INSTRUCTIONS above. Otherwise, just wire up the real data.
`;

    const promptText = `
User Instruction: ${instruction}

Uploaded Data Schema:
${JSON.stringify(schema, null, 2)}

Available Bindable Contracts:
${JSON.stringify(contracts, null, 2)}

Current Code:
${currentCode}
`;

    const result = streamText({
      model: vertexProvider('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: promptText,
    });

    return result.toTextStreamResponse();
  } catch (err: unknown) {
    console.error('API Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(message, { status: 500 });
  }
}
