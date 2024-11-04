import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

const HyDESystemPrompt = {
  role: "system",
  content: [
    {
      text: `You are an advanced AI assistant specialized in generating hypothetical answers for a Hypothetical Document Embedding (HyDE) system within a Retrieval Augmented Generation (RAG) framework. Your task is to create plausible, relevant answers to user questions that could potentially match actual document content in a vector database.\n\nFollow these guidelines to generate optimal hypothetical answers:\n\n1. Analyze the user's question thoroughly, understanding its main points, implicit context, and the type of information being sought.\n\n2. Generate a hypothetical answer that:\n   - Is directly relevant to the question\n   - Contains key terms and concepts likely to appear in actual documents\n   - Balances specificity with generality to maximize potential matches\n   - Maintains a neutral, informative tone\n   - Avoids introducing speculative or potentially false information\n\n3. Structure the answer in a way that mimics how it might appear in a real document:\n   - For factual questions, present information clearly and concisely\n   - For procedural questions, use a step-by-step format if appropriate\n   - For conceptual questions, provide definitions and explanations\n\n4. Include relevant details that could appear in an actual document, such as:\n   - Common terminology in the subject area\n   - Typical phrases or sentence structures used in formal writing\n   - Plausible data points or statistics (without inventing specific figures)\n\n5. Adjust the length and complexity of the answer based on the question:\n   - Provide brief, focused answers for simple questions\n   - Offer more detailed responses for complex queries\n\n6. If the question is ambiguous or could have multiple interpretations, generate an answer that addresses the most likely interpretation.\n\n7. For questions about current events or time-sensitive information, generate an answer that could be valid across a range of recent time periods.\n\n8. If the question asks for opinions or subjective information, generate a balanced response that could represent a consensus view.\n\nRemember, the goal is to create a hypothetical answer that is likely to have high vector similarity with actual relevant documents in the database, thereby improving the retrieval process in the RAG system.`,
      type: "text",
    },
  ],
} as ChatCompletionMessageParam;

const HyDEUserPrompt = (question: string) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Generate a hypothetical answer to the following question. This answer should be plausible and structured as if it were extracted from a relevant document, optimized for use in a Hypothetical Document Embedding (HyDE) system.\n\nUser Question: ${{
          question,
        }}\n\nPlease provide only the hypothetical answer, no other text. Ensure that your hypothetical answer is relevant, informative, and likely to match the content and style of actual documents addressing this topic.`,
      },
    ],
  } as ChatCompletionMessageParam);

export const HyDEGenerationSchema = z.object({
  originalQuestion: z.string().describe("The original user question"),
  hypotheticalAnswer: z.string().describe("The generated hypothetical answer"),
  keyTerms: z
    .array(z.string())
    .describe("Important terms or concepts used in the hypothetical answer"),
  answerType: z
    .enum(["factual", "procedural", "conceptual", "opinion-based", "mixed"])
    .describe("The primary type of information provided in the answer"),
  confidenceLevel: z
    .enum(["high", "medium", "low"])
    .describe(
      "Estimated confidence in the relevance and accuracy of the hypothetical answer"
    ),
});

const config = {
  model: MODEL,
  systemPrompt: HyDESystemPrompt,
  createUserPrompt: (question: string) => HyDEUserPrompt(question),
  schema: HyDEGenerationSchema,
  responseFormatKey: "hypotheticalAnswer",
} as const;

export async function generateHyDE({
  originalQuery,
}: {
  originalQuery: string;
}): Promise<z.infer<typeof HyDEGenerationSchema> | null> {
  return createCompletion({
    input: originalQuery,
    config,
  });
}
