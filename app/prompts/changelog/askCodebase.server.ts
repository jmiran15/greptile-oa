// generates questions to get context from codebase about changes
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const CodebaseQuestion = z.object({
  question: z.string().describe("The specific question to be answered"),
  context: z.object({
    path: z.string().describe("The file/folder path this question relates to"),
    code_elements: z
      .array(z.string())
      .describe(
        "Specific code elements (functions, components, etc.) mentioned"
      ),
    change_type: z
      .enum([
        "feature_addition",
        "feature_modification",
        "feature_removal",
        "performance_improvement",
        "bug_fix",
        "refactor",
        "dependency_change",
      ])
      .describe("Type of change this question relates to"),
  }),
  search_hints: z
    .array(z.string())
    .describe(
      "Specific terms, function names, or patterns to search for when answering this question"
    ),
  required_understanding: z.array(
    z.object({
      concept: z
        .string()
        .describe("What needs to be understood to answer this question"),
      why_needed: z
        .string()
        .describe("Why this understanding is crucial for the changelog"),
    })
  ),
  expected_insight_type: z
    .enum([
      "feature_purpose", // Why was this feature added/modified?
      "user_impact", // How does this affect end users?
      "feature_relationship", // How does this relate to other features?
      "business_value", // What business value does this provide?
      "ux_changes", // How does this affect user experience?
      "system_integration", // How does this integrate with other systems?
      "performance_impact", // How does this affect performance?
      "dependency_impact", // How do dependency changes affect users?
    ])
    .describe("The type of insight this question seeks to uncover"),
});

// Schema for questions about code changes
export const ChangelogQuestionsSchema = z.object({
  questions: z
    .array(CodebaseQuestion)
    .describe("Questions about broader context needed for changelog"),
});

const askCodebaseSystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert product manager and technical writer specializing in creating user-facing changelogs. Your role is to generate very specific questions about code changes that will help bridge the gap between technical changes and user-meaningful updates.\n\nKey Requirements:\n1. Generate extremely specific questions that can be easily searched for\n2. Include exact function names, file paths, and technical terms\n3. Focus on understanding user impact and feature relationships\n4. Consider different user perspectives and use cases\n5. Maintain traceability between technical changes and user features\n\nGuidelines:\n- Make questions answerable by searching a codebase\n- Include specific code elements in questions\n- Focus on user-visible impacts\n- Consider feature relationships\n- Think about business value\n- Include search guidance\n- Consider integration points\n\nRemember: Your questions will be used to find information in a codebase that helps explain changes to end users. Questions must be specific enough that answers can be found by searching code and documentation. Imagine giving these questions to someone unfamiliar with the codebase - they should be able to find answers through simple search terms.",
    },
  ],
} as ChatCompletionMessageParam;

const askCodebaseUserPrompt = ({ markdownTree }: { markdownTree: string }) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze this markdown tree of code changes and generate specific questions that will help create a user-focused changelog. The tree includes summaries of folders and descriptions of file changes.\n\nMarkdown Tree:\n"""\n${markdownTree}\n"""\n\nGenerate questions that will help understand:\n1. How these technical changes affect user-visible features\n2. The business value and user impact of each change\n3. Relationships between changed components and user features\n4. Integration points and system-wide effects\n5. Performance and UX implications\n\nYour questions should:\n- Reference specific functions, components, and paths\n- Include exact technical terms and identifiers\n- Provide clear search guidance\n- Consider different user perspectives\n- Build a chain of understanding\n\nFor example, instead of asking:\n❌ "How does this function affect performance?"\n\nAsk:\n✅ "How does the addition of batching to processUrls() in src/utils/scraper.ts affect the speed and reliability of website imports in the chatbot creation workflow?"\n\nEach question should be:\n- Specific enough to search for\n- Focused on user impact\n- Connected to visible features\n- Including technical details\n- Providing search context\n\nProvide your response in the specified JSON format.`,
      },
    ],
  } as ChatCompletionMessageParam);

const config = {
  model: MODEL,
  systemPrompt: askCodebaseSystemPrompt,
  createUserPrompt: ({ markdownTree }: { markdownTree: string }) =>
    askCodebaseUserPrompt({ markdownTree }),
  schema: ChangelogQuestionsSchema,
  responseFormatKey: "questions",
} as const;

export async function askQuestions({
  markdownTree,
}: {
  markdownTree: string;
}): Promise<z.infer<typeof ChangelogQuestionsSchema> | null> {
  return createCompletion({
    input: { markdownTree },
    config,
  });
}
