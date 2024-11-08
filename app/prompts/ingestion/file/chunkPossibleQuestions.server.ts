import { z } from "zod";

import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const PossibleQuestionsSchema = z.object({
  functionality_questions: z.array(
    z.object({
      question: z.string(),
      focus_area: z.enum([
        "usage",
        "purpose",
        "implementation",
        "integration",
        "error_handling",
        "data_flow",
        "performance",
        "dependencies",
      ]),
      referenced_elements: z.array(z.string()),
    })
  ),
  metadata: z.object({
    complexity_level: z.enum(["basic", "intermediate", "advanced"]),
    relevant_topics: z.array(z.string()),
  }),
});

const chunkPossibleQuestionsSystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert at anticipating questions developers might ask about code. Your role is to generate realistic, specific questions that could be asked about a code snippet, focusing on questions that would lead someone to need this specific code.\n\nKey Requirements:\n1. Generate questions that reference specific names, functions, or components\n2. Include questions about implementation details\n3. Cover integration and usage scenarios\n4. Address error handling and edge cases\n5. Consider performance and optimization concerns\n\nGuidelines:\n- Make questions specific, not generic\n- Include exact function/component names in questions\n- Consider questions from different expertise levels\n- Focus on practical, real-world usage scenarios\n- Include questions about technical details developers would search for\n\nRemember: These questions will be used to match searches to this code. Think about what developers might actually search for when they need this code.",
    },
  ],
} as ChatCompletionMessageParam;

const chunkPossibleQuestionsUserPrompt = ({
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
        text: `Generate specific, realistic questions that developers might ask that would lead them to need this code snippet from ${filepath} (lines ${startLine}-${endLine}).\n  \n  Code:\n  """\n  ${code}\n  """\n\nGenerate questions that:\n  1. Reference specific function/component names and implementation details\n  2. Cover different aspects (usage, implementation, integration, etc.)\n  3. Include questions about technical requirements and constraints\n  4. Address common development concerns and scenarios\n  5. Range from basic usage to advanced implementation details\n  \nEnsure questions are specific to this code and would actually help someone find this snippet when searching.`,
      },
    ],
  } as ChatCompletionMessageParam);

const config = {
  model: MODEL,
  systemPrompt: chunkPossibleQuestionsSystemPrompt,
  createUserPrompt: ({
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
    chunkPossibleQuestionsUserPrompt({
      filepath,
      startLine,
      endLine,
      code,
    }),
  schema: PossibleQuestionsSchema,
  responseFormatKey: "questions",
} as const;

export async function chunkPossibleQuestions({
  filepath,
  startLine,
  endLine,
  code,
}: {
  filepath: string;
  startLine: number;
  endLine: number;
  code: string;
}): Promise<z.infer<typeof PossibleQuestionsSchema> | null> {
  return createCompletion({
    input: { filepath, startLine, endLine, code },
    config,
  });
}
