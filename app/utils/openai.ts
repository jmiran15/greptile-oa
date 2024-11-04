// TODO - we also need to do the DAG stuff ... i.e. I found a node to be relevant, so I go up in the chain to get a better understanding
// also need to the user prompt to be like notes, i.e. summaries (probably of the file), then the code (so it understands)
// also .. make sure chunks of the same file are next to each other and that they don't repeat the summaries.

// TODO: update the prompts to be more code focused instead of general RAG
import { createId } from "@paralleldrive/cuid2";
import { V2RerankResponse } from "cohere-ai/api";
import uniqWith from "lodash/uniqWith";
import { performance } from "perf_hooks";
import { prisma } from "~/db.server";

import { Embedding } from "@prisma/client";
import { embed } from "~/queues/ingestion/ingestFile.server";
import { generateSimilarUserQueries } from "../prompts/search/augmentQuery.server";
import { generateHyDE } from "../prompts/search/HyDE.server";
import { generateSubQuestions } from "../prompts/search/subquestions.server";
import { cohere, openai } from "./providers.server";

const DEBUG_TIMING = process.env.NODE_ENV === "development";

interface TimingResult {
  operation: string;
  duration: number;
}

async function timeOperation<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<[T, TimingResult]> {
  const start = performance.now();
  try {
    const result = await fn();
    const end = performance.now();
    return [result, { operation, duration: end - start }];
  } catch (error) {
    const end = performance.now();
    console.error(`Error in operation ${operation}:`, error);
    return [null as T, { operation, duration: end - start }];
  }
}

export const CHUNK_SIZE = 1024;
export const OVERLAP = 20;
export const RERANK_MODEL:
  | "rerank-english-v3.0"
  | "rerank-multilingual-v3.0"
  | "rerank-english-v2.0"
  | "rerank-multilingual-v2.0" = "rerank-english-v3.0";

async function searchEmbeddings({
  repoId,
  queries,
  limit = 10,
  minSimilarity = 0.7,
}: {
  repoId: string;
  queries: string[];
  limit?: number;
  minSimilarity?: number;
}): Promise<EmbeddingWithDistance[]> {
  // Batch embed all queries
  console.time("Batch Embed");
  const embeddings = await batchEmbed(queries);
  console.timeEnd("Batch Embed");

  const searchTasks = embeddings.flatMap((embedding) => [
    fetchRelevantEmbeddingsWithVector({
      repoId,
      embedding,
      k: limit,
      minSimilarity,
    }),
  ]);

  console.time("Search");
  const results = await Promise.all(searchTasks);
  console.timeEnd("Search");

  const allResults = results
    .flat()
    .filter((result): result is EmbeddingWithDistance => result !== null);

  const uniqueResults = uniqWith(
    allResults,
    (a, b) => a.id === b.id && a.chunkContent === b.chunkContent
  );

  return uniqueResults;
}

export async function chat({
  repoId,
  query,
}: {
  repoId: string;
  query: string;
}) {
  const timings: TimingResult[] = [];
  const totalStart = performance.now();

  let rerankedEmbeddings: V2RerankResponse | null = null;
  let relevantEmbeddings: EmbeddingWithDistance[] = [];

  const [preprocessingResults, preprocessingTiming] = await timeOperation(
    "Preprocessing",
    async () => {
      const [similarQueriesResult, subQuestionsResult, hydeResult] =
        await Promise.allSettled([
          generateSimilarUserQueries({
            originalQuery: query,
          }),
          generateSubQuestions({
            originalQuery: query,
          }),
          generateHyDE({
            originalQuery: query,
          }),
        ]);

      return {
        similarQueries:
          similarQueriesResult.status === "fulfilled"
            ? similarQueriesResult.value
            : null,
        subQuestions:
          subQuestionsResult.status === "fulfilled"
            ? subQuestionsResult.value
            : null,
        hyde: hydeResult.status === "fulfilled" ? hydeResult.value : null,
      };
    }
  );
  timings.push(preprocessingTiming);

  const { similarQueries, subQuestions, hyde } = preprocessingResults;

  // Log errors if any
  if (similarQueries === null) {
    console.error("Failed to generate similar queries");
  }
  if (subQuestions === null) {
    console.error("Failed to generate sub questions");
  }
  if (hyde === null) {
    console.error("Failed to generate HyDE");
  }

  const allQueries = [
    query,
    ...(similarQueries?.expandedQueries ?? []),
    ...(subQuestions?.subQuestions?.map(
      (subQuestion) => subQuestion.question
    ) ?? []),
    hyde?.hypotheticalAnswer ?? "",
  ].filter(Boolean);

  const [searchResults, searchTiming] = await timeOperation(
    "Embedding Search",
    () =>
      searchEmbeddings({
        repoId,
        queries: allQueries,
        limit: 100,
        // minSimilarity: 0.6,
        minSimilarity: 0,
      })
  );
  timings.push(searchTiming);
  relevantEmbeddings = searchResults;

  if (relevantEmbeddings.length > 0) {
    // Rerank with Cohere Ranker 3
    const [rerankResults, rerankTiming] = await timeOperation("Reranking", () =>
      rerank({
        query,
        documents: relevantEmbeddings.map((embedding) => ({
          id: embedding.id,
          text: embedding.chunkContent, // TODO - maybe change
        })),
        topN: 10, // TODO - Probably increase this number... or perhaps we can make it a percentage of the total documents in a chatbot's embedding space, up-to some max. and would prob. be for it to be expontential to some point, and then drop off exponentially, almost like a sigmoid curve.
        model: RERANK_MODEL,
      })
    );
    timings.push(rerankTiming);
    rerankedEmbeddings = rerankResults;
  }

  // create the prompts and call the final LLM
  const systemPrompt =
    "You are a helpful assistant for answering questions about the repository.";

  let augmentedContext: AugmentedContext[] = [];

  if (rerankedEmbeddings) {
    augmentedContext = augmentRerankedEmbeddings(
      rerankedEmbeddings,
      relevantEmbeddings
    );
  }

  const userPrompt = () => {
    return `
    Augmented Context: ${JSON.stringify(augmentedContext)}\n\n
    Answer the following question: ${query}\n\n
    Based on the above context, provide a detailed and long answer to the question.
    `;
  };

  console.log("augmentedContext: ", augmentedContext);
  console.log("rerankedEmbeddings: ", rerankedEmbeddings);

  const [response, responseTiming] = await timeOperation(
    "LLM Stream Creation",
    () =>
      openai.chat.completions.create(
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt() },
          ],
          model: "gpt-4o",
          temperature: 0,
        },
        {
          headers: {
            "Helicone-Property-Environment": process.env.NODE_ENV,
          },
        }
      )
  );
  timings.push(responseTiming);

  const totalEnd = performance.now();
  const totalDuration = totalEnd - totalStart;

  if (DEBUG_TIMING) {
    console.log("Chat Function Timing Results:");
    timings.forEach(({ operation, duration }) => {
      console.log(`  ${operation}: ${duration.toFixed(2)}ms`);
    });
    console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
  }

  return response;
}

type EmbeddingWithDistance = Omit<Embedding, "embedding">;
async function rerank({
  query,
  documents,
  topN,
  model,
}: {
  query: string;
  documents: { id: string; text: string }[];
  topN: number;
  model: typeof RERANK_MODEL;
}): Promise<V2RerankResponse> {
  const reranked = await cohere.v2.rerank({
    documents,
    query,
    topN,
    model,
    returnDocuments: true,
  });

  return reranked;
}

const MAX_BATCH_SIZE = 100;

export async function batchEmbed(inputs: string[]): Promise<number[][]> {
  const batches = [];
  for (let i = 0; i < inputs.length; i += MAX_BATCH_SIZE) {
    batches.push(inputs.slice(i, i + MAX_BATCH_SIZE));
  }

  const key = `batchEmbed:${inputs.length}`;
  console.time(key);

  // TODO: batch this so it doesn't crash
  const results = await embed({
    input: inputs,
  });

  console.timeEnd(key);

  return results as number[][];
}

async function fetchRelevantEmbeddingsWithVector({
  repoId,
  embedding,
  k = 5,
  minSimilarity = 0.7,
}: {
  repoId: string;
  embedding: number[];
  k?: number;
  minSimilarity?: number;
}): Promise<EmbeddingWithDistance[] | null> {
  try {
    const key = `fetchEmbeddings:${createId()}`;
    console.time(key);
    const results = await prisma.$queryRaw<EmbeddingWithDistance[]>`
      SELECT
        e.id,
        e."createdAt",
        e."repoId",
        e."nodeId",
        e."chunkContent",
        e."embeddedContent"
      FROM "Embedding" e
      WHERE e."repoId" = ${repoId}
      ORDER BY e.embedding <=> ${embedding}::vector(1536)
      LIMIT ${k};
    `;

    console.timeEnd(key);

    return results.length > 0 ? results : null;
  } catch (error) {
    console.log("error: ", error);
    console.error("Error fetching relevant embeddings:", error);
    return null;
  }
}

type AugmentedContext = {
  id: string;
  relevanceScore: number;
  index: number;
  text: string;
};

function augmentRerankedEmbeddings(
  rerankedEmbeddings: V2RerankResponse,
  relevantEmbeddings: EmbeddingWithDistance[]
): AugmentedContext[] {
  return rerankedEmbeddings.results.map((result) => {
    const relevantEmbedding = relevantEmbeddings[result.index];
    return {
      id: relevantEmbedding.id,
      relevanceScore: result.relevanceScore,
      index: result.index,
      text: result.document?.text ?? "",
    };
  });
}
