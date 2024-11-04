import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { createCompletion } from "~/utils/generateStructuredOutput.server";
const MODEL = "gpt-4o-mini";

export const FolderQuestionsSchema = z.object({
  functionality_questions: z
    .array(
      z.object({
        question: z
          .string()
          .describe("The specific question a developer might ask"),
        focus_area: z
          .enum([
            "organization",
            "architecture",
            "feature_location",
            "integration",
            "dependencies",
            "testing",
            "deployment",
            "development",
          ])
          .describe("The main focus or category of the question"),
        referenced_paths: z
          .array(z.string())
          .describe("Specific paths referenced in this question"),
        context: z
          .string()
          .describe("Additional context that makes this question relevant"),
      })
    )
    .describe("Questions developers might ask about this folder"),
  metadata: z
    .object({
      complexity_level: z
        .enum(["basic", "intermediate", "advanced"])
        .describe("The expertise level needed to work with this folder"),
      relevant_topics: z
        .array(z.string())
        .describe("Key technical topics relevant to this folder"),
      suggested_expertise: z
        .array(z.string())
        .describe("Areas of expertise helpful for working with this code"),
    })
    .describe("Metadata about the folder's complexity and requirements"),
});

const folderPossibleQuestionsSystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert at anticipating questions developers might ask about code organization and folder structure. Your role is to generate realistic questions that would lead developers to need information about this folder'''s contents and organization.\n\nKey Requirements:\n1. Focus on folder organization and structure\n2. Include questions about code location and navigation\n3. Address architectural decisions\n4. Consider integration patterns\n5. Include questions about development workflow\n\nGuidelines:\n- Make questions specific to this folder structure\n- Reference actual paths and components\n- Consider different developer experience levels\n- Focus on practical, real-world scenarios\n- Include questions about organization patterns\n- Consider both new and experienced team members\n\nRemember: Questions should help developers find and understand code organization.",
    },
  ],
} as ChatCompletionMessageParam;

const folderPossibleQuestionsUserPrompt = ({
  folderPath,
  childrenLength,
  childrenSummaries,
}: {
  folderPath: string;
  childrenLength: number;
  childrenSummaries: string;
}) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Generate specific questions that developers might ask about the folder at "${folderPath}" and its contents. Focus on questions that would help developers understand and navigate this code.\n\nFolder Contents (${childrenLength} total items, showing up to 10 random samples):\n"""\n${childrenSummaries}\n"""\n\nGenerate questions that:\n1. Help developers locate specific features\n2. Address code organization patterns\n3. Cover integration with other code\n4. Consider development workflows\n5. Range from basic navigation to advanced architecture\n\nEnsure questions reference specific paths and components when relevant.`,
      },
    ],
  } as ChatCompletionMessageParam);

const config = {
  model: MODEL,
  systemPrompt: folderPossibleQuestionsSystemPrompt,
  createUserPrompt: ({
    folderPath,
    childrenLength,
    childrenSummaries,
  }: {
    folderPath: string;
    childrenLength: number;
    childrenSummaries: string;
  }) =>
    folderPossibleQuestionsUserPrompt({
      folderPath,
      childrenLength,
      childrenSummaries,
    }),
  schema: FolderQuestionsSchema,
  responseFormatKey: "functionality_questions",
} as const;

export async function folderPossibleQuestions({
  folderPath,
  childrenLength,
  childrenSummaries,
}: {
  folderPath: string;
  childrenLength: number;
  childrenSummaries: string;
}): Promise<z.infer<typeof FolderQuestionsSchema> | null> {
  return createCompletion({
    input: { folderPath, childrenLength, childrenSummaries },
    config,
  });
}
