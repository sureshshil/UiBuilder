import { createVertex } from '@ai-sdk/google-vertex';
import { generateObject } from 'ai';
import { z } from 'zod';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { schema } = await req.json();

    const vertexProvider = createVertex({
      project: process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT,
      location: process.env.GOOGLE_VERTEX_LOCATION || 'us-central1',
    });

    const result = await generateObject({
      model: vertexProvider('gemini-2.5-flash'),
      system: `You are an expert UI/UX designer. The user has uploaded a data file with the provided schema/metadata.
Your job is to suggest exactly 3 different, highly specific React UI components that would best visualize this data.
For example, if it's sales data, suggest things like "Revenue Line Chart Dashboard", "Regional Sales Data Grid", etc.
Output exactly 3 short string suggestions (under 8 words each).`,
      prompt: `Here is the data schema/metadata:\n\n${JSON.stringify(schema, null, 2)}\n\nSuggest 3 UI components for this data.`,
      schema: z.object({
        suggestions: z.array(z.string()).length(3)
      }),
    });

    return Response.json(result.object);
  } catch (err: unknown) {
    console.error('API Suggest Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(message, { status: 500 });
  }
}
