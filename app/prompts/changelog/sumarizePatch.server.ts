// summarizes a patch - given the patch and a summary of the file

import { z } from "zod";

import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const PatchSummarySchema = z
  .object({
    primary_change: z
      .object({
        type: z
          .enum([
            "feature_addition", // New functionality added
            "feature_modification", // Existing feature changed
            "feature_removal", // Feature removed
            "refactor", // Code restructuring without behavior change
            "dependency_change", // Changes to imports/exports
            "error_handling", // Changes to error handling
            "performance", // Performance improvements
            "config_change", // Configuration changes
            "cleanup", // Removing unused code, logs, etc.
          ])
          .describe("The primary type of change made to the file"),
        description: z
          .string()
          .describe("Concise description of the primary change"),
      })
      .describe("The main change represented by this patch"),

    technical_changes: z
      .array(
        z.object({
          category: z
            .enum([
              "imports_exports", // Changes to module dependencies
              "state_management", // Changes to state handling
              "data_flow", // Changes to how data moves through the code
              "api_integration", // Changes to API calls/handling
              "component_structure", // Changes to component architecture
              "prop_changes", // Changes to component props
              "hook_usage", // Changes to React hooks
              "error_handling", // Changes to error/edge case handling
              "performance", // Performance-related changes
              "types", // Changes to TypeScript types
              "utilities", // Changes to utility functions
            ])
            .describe("The technical category of this change"),
          details: z.string().describe("Technical details of the change"),
        })
      )
      .describe("Detailed breakdown of technical changes"),
    impact_analysis: z
      .object({
        behavioral_changes: z
          .array(z.string())
          .describe("How the changes affect the behavior of the code"),
        data_flow_changes: z
          .array(z.string())
          .describe("How data handling or flow has changed"),
        dependency_changes: z
          .array(z.string())
          .describe(
            "Changes to external dependencies or internal module relationships"
          ),
        potential_risks: z
          .array(z.string())
          .describe("Potential risks or areas needing careful review"),
      })
      .describe("Analysis of the change's impact"),

    migration_notes: z
      .array(
        z.object({
          type: z.enum([
            "breaking_change",
            "deprecation",
            "required_update",
            "optional_update",
          ]),
          description: z.string(),
          required_actions: z.array(z.string()),
        })
      )
      .describe("Notes about migration requirements or breaking changes"),
  })
  .describe("Comprehensive summary of a code patch");

const summarizePatchSystem = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are an expert code analyst specializing in understanding and explaining code changes. Your role is to create detailed, technical summaries of code patches that will be used for changelog generation. Your analysis needs to be comprehensive, precise, and technically accurate.\n\nKey Requirements:\n1. Analyze all technical changes with exact details\n2. Identify patterns and underlying architectural changes\n3. Explain impact on code behavior and data flow\n4. Note any breaking changes or migration requirements\n5. Provide context about why changes were made when evident\n\nGuidelines:\n- Be extremely specific about what changed\n- Use exact function names, variables, and types\n- Explain both the what and why of changes\n- Include relevant line numbers\n- Highlight potential risks or side effects\n- Note all dependency changes\n- Identify patterns in the changes\n- Consider impact on related code\n\nRemember: Your summary will be used to generate user-facing changelogs and technical documentation. Missing important details could lead to incomplete or misleading changelogs.",
    },
  ],
} as ChatCompletionMessageParam;

const summarizePatchUser = ({
  patch,
  fileSummary,
}: {
  patch: string;
  fileSummary: string; // TODO - upstream for now
}) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please analyze the following code patch and create a detailed technical summary.\n\nOriginal File Summary:\n"""\n${fileSummary}\n"""\n\nPatch:\n"""\n${patch}\n"""\n\nCreate a comprehensive summary that:\n1. Identifies and explains all technical changes\n2. Notes any architectural or pattern changes\n3. Explains impact on code behavior and data flow\n4. Highlights breaking changes or migration needs\n5. Provides context about the purpose of changes\n\nFocus on details that would be important for:\n- Developers maintaining this code\n- Generating meaningful changelogs\n- Understanding technical impact\n- Planning necessary migrations\n- Identifying potential risks\n\nProvide your response in the specified JSON format, ensuring all technical details are precise and accurate.`,
      },
    ],
  } as ChatCompletionMessageParam);

const MAX_PATCH_LENGTH = 6000;
const MAX_RETRY_DEPTH = 3;
const MIN_PATCH_LENGTH = 500;
const hunkHeaderRegex = /^@@ -\d+,\d+ \+\d+,\d+ @@/;

interface SplitPatchResult {
  firstHalf: string;
  secondHalf: string;
}

function splitPatchAtBoundary(patch: string): SplitPatchResult {
  const lines = patch.split("\n");
  const midPoint = Math.floor(lines.length / 2);

  let splitIndex = midPoint;
  const searchRange = Math.floor(lines.length * 0.1);

  for (let i = 0; i < searchRange; i++) {
    // Check both above and below midpoint
    if (hunkHeaderRegex.test(lines[midPoint - i] || "")) {
      splitIndex = midPoint - i;
      break;
    }
    if (hunkHeaderRegex.test(lines[midPoint + i] || "")) {
      splitIndex = midPoint + i;
      break;
    }

    // Fallback: use empty lines if no hunk headers found nearby
    if (lines[midPoint - i]?.trim() === "") {
      splitIndex = midPoint - i;
      break;
    }
    if (lines[midPoint + i]?.trim() === "") {
      splitIndex = midPoint + i;
      break;
    }
  }

  return {
    firstHalf: lines.slice(0, splitIndex).join("\n"),
    secondHalf: lines.slice(splitIndex).join("\n"),
  };
}

function mergePatchSummaries(
  first: z.infer<typeof PatchSummarySchema>,
  second: z.infer<typeof PatchSummarySchema>
): z.infer<typeof PatchSummarySchema> {
  return {
    primary_change: {
      type: first.primary_change.type,
      description: `${first.primary_change.description}; ${second.primary_change.description}`,
    },
    technical_changes: [
      ...first.technical_changes,
      ...second.technical_changes,
    ],
    impact_analysis: {
      behavioral_changes: [
        ...first.impact_analysis.behavioral_changes,
        ...second.impact_analysis.behavioral_changes,
      ],
      data_flow_changes: [
        ...first.impact_analysis.data_flow_changes,
        ...second.impact_analysis.data_flow_changes,
      ],
      dependency_changes: [
        ...first.impact_analysis.dependency_changes,
        ...second.impact_analysis.dependency_changes,
      ],
      potential_risks: [
        ...first.impact_analysis.potential_risks,
        ...second.impact_analysis.potential_risks,
      ],
    },
    migration_notes: [...first.migration_notes, ...second.migration_notes],
  };
}

async function processPatchSegment(
  patch: string,
  fileSummary: string,
  depth: number = 0
): Promise<z.infer<typeof PatchSummarySchema> | null> {
  if (patch.length <= MAX_PATCH_LENGTH || depth >= MAX_RETRY_DEPTH) {
    return summarizePatchDirect({ patch, fileSummary });
  }

  if (patch.length < MIN_PATCH_LENGTH) {
    return summarizePatchDirect({ patch, fileSummary });
  }

  const { firstHalf, secondHalf } = splitPatchAtBoundary(patch);

  const [firstResult, secondResult] = await Promise.all([
    processPatchSegment(firstHalf, fileSummary, depth + 1),
    processPatchSegment(secondHalf, fileSummary, depth + 1),
  ]);

  if (!firstResult || !secondResult) return null;

  return mergePatchSummaries(firstResult, secondResult);
}

const config = {
  model: MODEL,
  systemPrompt: summarizePatchSystem,
  createUserPrompt: ({
    patch,
    fileSummary,
  }: {
    patch: string;
    fileSummary: string;
  }) => summarizePatchUser({ patch, fileSummary }),
  schema: PatchSummarySchema,
  responseFormatKey: "summary",
} as const;

async function summarizePatchDirect({
  patch,
  fileSummary,
}: {
  patch: string;
  fileSummary: string;
}): Promise<z.infer<typeof PatchSummarySchema> | null> {
  return createCompletion({
    input: { patch, fileSummary },
    config,
  });
}

export async function summarizePatch({
  patch,
  fileSummary,
}: {
  patch: string;
  fileSummary: string;
}): Promise<z.infer<typeof PatchSummarySchema> | null> {
  return processPatchSegment(patch, fileSummary);
}
