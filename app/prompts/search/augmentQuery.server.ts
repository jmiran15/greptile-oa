import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { z } from "zod";
import { createCompletion } from "~/utils/generateStructuredOutput.server";

const MODEL = "gpt-4o-mini";

export const augmentQuerySystemPrompt = {
  role: "system",
  content: [
    {
      text: `You are an advanced AI assistant specialized in query expansion for a Retrieval Augmented Generation (RAG) system. Your task is to generate a diverse set of alternative queries based on a user's original question. These expanded queries will be used to search a vector database, aiming to retrieve the most relevant documents.\n\nFollow these guidelines:\n\n1. Analyze the user's question thoroughly, understanding its main intent, context, and any implicit information.\n\n2. Generate 5-10 alternative queries that maintain the core intent of the original question. Consider:\n   - Rephrasing using synonyms and related terms\n   - Varying the sentence structure and question type\n   - Expanding acronyms or abbreviations, and vice versa\n   - Generalizing specific terms and specifying general terms\n   - Incorporating common related concepts not explicitly mentioned\n\n3. Ensure diversity in the generated queries:\n   - Include both broader and more specific versions of the question\n   - Use different question words (e.g., what, how, why, when) where appropriate\n   - Consider potential user perspectives (e.g., novice vs. expert)\n\n4. Maintain the original meaning and intent of the user's question in all variations.\n\n5. If the original query is ambiguous or lacks context, generate variations that explore possible interpretations.\n\n6. For multi-part questions, create some variations that focus on individual parts and others that combine parts differently.\n\n7. If the query includes proper nouns, technical terms, or domain-specific language, include variations both with and without these specific terms.\n\n8. Avoid introducing unrelated concepts or significantly changing the topic of the query.\n\nRemember, the goal is to create a set of queries that will enhance the RAG system's ability to find relevant documents in the vector database, potentially overcoming limitations of distance-based similarity search.`,
      type: "text",
    },
  ],
} as ChatCompletionMessageParam;

export const augmentQueryUserPrompt = (question: string) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Generate a diverse set of alternative queries based on the following user question. These expanded queries will be used to search a vector database in a RAG system.\n\nOriginal Question: "${{
          question,
        }}"\n\nPlease provide your output in the structured format defined in the response_format. Ensure that your generated queries maintain the original intent while exploring various phrasings and perspectives.`,
      },
    ],
  } as ChatCompletionMessageParam);

export const RuntimeQueryExpansionSchema = z.object({
  originalQuery: z.string().describe("The original user question"),
  expandedQueries: z
    .array(z.string())
    .describe("Array of alternative queries based on the original question"),
  queryIntent: z
    .string()
    .describe(
      "A brief description of the interpreted main intent of the original query"
    ),
  keyTerms: z
    .array(z.string())
    .describe("Important terms or concepts from the original query"),
});

const config = {
  model: MODEL,
  systemPrompt: augmentQuerySystemPrompt,
  createUserPrompt: (question: string) => augmentQueryUserPrompt(question),
  schema: RuntimeQueryExpansionSchema,
  responseFormatKey: "additionalQueries",
} as const;

export async function generateSimilarUserQueries({
  originalQuery,
}: {
  originalQuery: string;
}): Promise<z.infer<typeof RuntimeQueryExpansionSchema> | null> {
  return createCompletion({
    input: originalQuery,
    config,
  });
}
