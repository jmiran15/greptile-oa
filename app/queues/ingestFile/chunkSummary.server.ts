import { z } from "zod";

import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { openai } from "~/utils/providers.server";

const MODEL = "gpt-4o-mini";

export const CodeSummarySchema = z.object({
  summary: z.string().describe("Comprehensive summary of the code"),
  key_elements: z.array(
    z.object({
      type: z.enum([
        "component",
        "function",
        "class",
        "hook",
        "type",
        "interface",
        "constant",
        "export",
        "import",
      ]),
      name: z
        .string()
        .describe("Exact name of the element as it appears in code"),
      description: z
        .string()
        .describe("Brief description of the element's purpose"),
    })
  ),
  technical_details: z.object({
    patterns_used: z.array(z.string()),
    primary_purpose: z.string(),
    dependencies: z.array(z.string()),
  }),
});

const chunkSummarySystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert code analyst specializing in creating detailed, searchable summaries of code. Your summaries will be used to create embeddings for a code search system, so they must be rich in technical details and specific names.\n\nKey Requirements:\n1. Always mention exact names of components, functions, classes, and other code elements\n2. Include specific technical patterns and architecture decisions\n3. Describe dependencies and relationships between code elements\n4. Use consistent technical terminology\n5. Highlight unique or important implementation details\n\nGuidelines:\n- Emphasize searchable terms and names\n- Describe functionality in concrete, specific terms\n- Include technical details that developers might search for\n- Mention file paths or locations when relevant\n- Reference specific line numbers when discussing key elements\n\nRemember: Your summary will be used to help developers find this code when searching. Include terms and descriptions they might use in their searches.",
    },
  ],
} as ChatCompletionMessageParam;

const chunkSummaryUserPrompt = ({
  filepath,
  startLine,
  endLine,
  code,
}: {
  filepath: string;
  startLine: number;
  endLine: number;
  code: string;
}) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze the following code snippet from ${filepath} (lines ${startLine}-${endLine}) and create a detailed, searchable summary. Focus on making the summary useful for code search.\n\nCode:\n"""\n${code}\n"""\n\nProvide your response in the specified JSON format. Ensure every important code element (function, component, class, etc.) is captured in key_elements, as these will be crucial for search functionality.\n\nRemember to:\n1. Mention all specific names of functions, components, variables, and types\n2. Describe the technical implementation approach\n3. Note any important patterns or architectural decisions\n4. Include information about dependencies and relationships\n5. Highlight any unique or notable aspects of the implementation`,
      },
    ],
  } as ChatCompletionMessageParam);

// TODO - modularize a "structured output" function that we can reuse - just pass in prompts and schema?
export async function chunkSummary({
  filepath,
  startLine,
  endLine,
  code,
}: {
  filepath: string;
  startLine: number;
  endLine: number;
  code: string;
}): Promise<z.infer<typeof CodeSummarySchema> | null> {
  try {
    const completion = await openai.beta.chat.completions.parse(
      {
        model: MODEL,
        messages: [
          chunkSummarySystemPrompt,
          chunkSummaryUserPrompt({
            filepath,
            startLine,
            endLine,
            code,
          }),
        ],
        response_format: zodResponseFormat(CodeSummarySchema, "summary"),
        temperature: 0,
        max_tokens: 2048,
      },
      {
        headers: {
          "Helicone-Property-Environment": process.env.NODE_ENV,
        },
      }
    );

    const result = completion.choices[0].message;

    if (result.parsed) {
      return result.parsed;
    } else if (result.refusal) {
      return null;
    }
  } catch (e) {
    if ((e as Error).constructor.name == "LengthFinishReasonError") {
      // Retry with a higher max tokens
      console.log("Too many tokens: ", (e as Error).message);
    } else {
      // Handle other exceptions
      console.log("An error occurred: ", (e as Error).message);
    }
  }
  return null;
}
