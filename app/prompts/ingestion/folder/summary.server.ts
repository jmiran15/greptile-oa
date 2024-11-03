import { z } from "zod";

import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const FolderSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      "A comprehensive summary of the folder's purpose and contents, optimized for semantic search"
    ),
  key_elements: z
    .array(
      z.object({
        type: z
          .enum([
            "component_group", // e.g., UI components
            "utility_group", // e.g., helper functions
            "config_group", // e.g., configuration files
            "test_group", // e.g., test files
            "feature_group", // e.g., specific feature implementation
            "type_definitions", // e.g., TypeScript types/interfaces
            "api_group", // e.g., API-related files
            "resource_group", // e.g., assets, static files
          ])
          .describe("The categorical type of this group of related items"),
        name: z
          .string()
          .describe("The name/identifier for this group of related items"),
        description: z
          .string()
          .describe(
            "Detailed description of this group's purpose and contents"
          ),
        contained_paths: z
          .array(z.string())
          .describe("List of important paths contained in this group"),
      })
    )
    .describe(
      "Major functional groups or categories of code within this folder"
    ),
  architectural_details: z
    .object({
      patterns_used: z
        .array(z.string())
        .describe("Common patterns or architectures present in this folder"),
      relationships: z
        .array(
          z.object({
            path: z.string(),
            relationship_type: z.enum([
              "depends_on",
              "imported_by",
              "configures",
              "implements",
              "tests",
              "extends",
            ]),
            description: z.string(),
          })
        )
        .describe(
          "Key relationships between this folder and other parts of the codebase"
        ),
      primary_purpose: z
        .string()
        .describe("The main architectural purpose of this folder"),
      organization_strategy: z
        .string()
        .describe("How code is organized within this folder"),
    })
    .describe("Technical and architectural aspects of the folder"),
});

const folderSummarySystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert code architect specializing in analyzing folder structures and code organization in large codebases. Your summaries will be used to create embeddings for a code search system, focusing on helping developers understand code organization and locate features.\n\nKey Requirements:\n1. Analyze folder contents and organization patterns\n2. Identify major functional groups of code\n3. Highlight architectural patterns and relationships\n4. Use exact paths and names\n5. Focus on searchable, technical details\n\nGuidelines:\n- Emphasize folder organization and structure\n- Describe relationships between components\n- Highlight key features and their locations\n- Use consistent technical terminology\n- Reference specific paths when important\n- Focus on details developers might search for\n\nRemember: Your summary should help developers quickly locate code and understand its organization.",
    },
  ],
} as ChatCompletionMessageParam;

const folderSummaryUserPrompt = ({
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
        text: `Please analyze the following folder structure and its contents at path "${folderPath}". This analysis should help developers understand the folder\'\'\'s organization and contents.\n\nFolder Contents (${childrenLength} total items, showing up to 10 random samples):\n"""\n${childrenSummaries}\n"""\n\nCreate a detailed, searchable summary focusing on:\n1. Overall purpose and organization of this folder\n2. Major groups of related functionality\n3. Architectural patterns and relationships\n4. Key features and their locations\n5. Integration patterns with other code\n\nProvide your response in the specified JSON format, ensuring all paths and names are exact matches to the input.`,
      },
    ],
  } as ChatCompletionMessageParam);

const config = {
  model: MODEL,
  systemPrompt: folderSummarySystemPrompt,
  createUserPrompt: ({
    folderPath,
    childrenLength,
    childrenSummaries,
  }: {
    folderPath: string;
    childrenLength: number;
    childrenSummaries: string;
  }) =>
    folderSummaryUserPrompt({
      folderPath,
      childrenLength,
      childrenSummaries,
    }),
  schema: FolderSummarySchema,
  responseFormatKey: "summary",
} as const;

export async function folderSummary({
  folderPath,
  childrenLength,
  childrenSummaries,
}: {
  folderPath: string;
  childrenLength: number;
  childrenSummaries: string;
}): Promise<z.infer<typeof FolderSummarySchema> | null> {
  return createCompletion({
    input: { folderPath, childrenLength, childrenSummaries },
    config,
  });
}
