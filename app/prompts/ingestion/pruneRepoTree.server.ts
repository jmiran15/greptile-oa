import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const PruneResultSchema = z.object({
  paths_to_exclude: z.array(
    z.object({
      path: z
        .string()
        .describe("The path to the file or directory that should be excluded"),
      reason: z
        .enum([
          "data_file",
          "generated_code",
          "dependency_file",
          "ci_cd",
          "infrastructure",
          "non_essential_docs",
          "temp_file",
          "media_asset",
          "other",
        ])
        .describe("The category explaining why this path should be excluded"),
      explanation: z
        .string()
        .describe(
          "Detailed explanation of why this specific path should be excluded"
        ),
    })
  ),
  reasoning_notes: z
    .string()
    .describe(
      "Overall notes explaining the rationale behind the pruning decisions"
    ),
});

const pruneRepoTreeSystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert code analyst specializing in identifying which files in a codebase should be excluded from semantic code search indexing. Your goal is to analyze a repository structure and identify files/directories that would NOT be helpful when asking questions about how the codebase works.\n\nKey Responsibilities:\n1. Identify files that don'''t contribute to understanding the codebase'''s functionality\n2. Recognize patterns of generated, temporary, or non-essential files\n3. Preserve all files that could help in understanding the code'''s architecture, implementation, or business logic\n\nGuidelines for Exclusion:\n- Data files that don'''t contain logic (e.g., large JSONs, CSVs)\n- Generated code that duplicates information\n- Build artifacts and temporary files\n- Non-essential documentation (e.g., changelog, contributor guidelines)\n- Infrastructure files that don'''t impact code understanding\n- CI/CD configurations unless they'''re essential to understand the deployment\n- Package manager files that don'''t describe dependencies\n\nGuidelines for Preservation:\n+ All source code files with business logic\n+ Main configuration files that affect code behavior\n+ Type definitions and interfaces\n+ Core documentation about architecture/design\n+ Test files that demonstrate code usage\n+ Essential documentation (README, API docs)\n\nIMPORTANT: Be conservative in pruning. If there'''s doubt about whether a file might be useful for understanding the codebase, preserve it. Provide clear explanations for each exclusion decision.",
    },
  ],
} as ChatCompletionMessageParam;

const pruneRepoTreeUserPrompt = ({ tree }: { tree: string }) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze the following codebase structure and identify files/directories that should be excluded from semantic code search indexing. The structure is provided in a markdown-style tree format:\n\n"""\n${tree}\n"""\n\nYour task is to identify paths that would NOT be helpful when asking questions about how this codebase works. Consider:\n\n1. Which files/directories contain no meaningful code or documentation that would help understand the codebase?\n2. Are there any data files, generated code, or temporary files that should be excluded?\n3. Which configuration files are essential for understanding the codebase versus just deployment/build details?\n\nProvide your response in the specified JSON format, including:\n- A list of paths to exclude with their reasons and detailed explanations\n- Overall notes about your pruning decisions\n\nBe conservative in your pruning - if a file might contain valuable information for understanding the codebase, do not exclude it. Focus on removing only files that are clearly not useful for code comprehension.`,
      },
    ],
  } as ChatCompletionMessageParam);

const config = {
  model: MODEL,
  systemPrompt: pruneRepoTreeSystemPrompt,
  createUserPrompt: ({ tree }: { tree: string }) =>
    pruneRepoTreeUserPrompt({ tree }),
  schema: PruneResultSchema,
  responseFormatKey: "pruning",
} as const;

export async function pruneRepoTree({
  markdownTree,
}: {
  markdownTree: string;
}): Promise<z.infer<typeof PruneResultSchema> | null> {
  return createCompletion({
    input: { tree: markdownTree },
    config,
  });
}
