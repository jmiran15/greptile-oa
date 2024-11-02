// ingest a single file - we can think of a single file as a "document"

// TODO - we should probably include some codebase context in here somehow?

// I'm thinking we "embed" at the folder level as well - somewhat of an overview/summary of the contents
// We should also embed a summary of each file - + questions for the files as well

// Okay, here is what im thinking:
// File gets chunked up regularly + all the regular RAG augmentaiton stuff
// while augmenting chunks - we generate a summary of that chunk (small)

// we then combine all of these summaries to create a summary of a file
// then we augment the file summary + generate possible questions for the file

// we do this for all files
// if the file is in a folder, we also create a summary of the folder, based on the summary of all the files + generate possible questions for the folder

// we do this recursively for all folders (since folders can contain other folders)

// THIS SHOULD GIVE US AN EXTREMELY ROBUST EMBEDDING SET FOR ANY FILE IN THE CODEBASE! + we partition the embedding space so it should take TOO long!

// AT INFERENCE TIME (Questions)
// - just generate all the possible augmentations (like we do for chatmate), but for code

// rerank with cohere

// END INGESTION + INFERENCE

// -> BY TOMORROW
// (/repo) enter repo path, add repo to db, ingest the repo, click on repo and be able to ask a question
// (/changelog) enter the pr path (must match some repo in the db, o/w don't generate) -> generate the changelog

// Sunday should all be Github integration stff + UI

// and monday we will probably finish up.

// CHANGLOG GENERATION PROCESS
// I dont think it will take TOOOO long
// summarize changes + group
// create changelog / group + combine all the changelogs
// ask Questions
// generate final version with answers
// CHANGLOG GENERATION PROCESS

// OKAY - now at changelog generation time - for the initial v0.1 of the changelog, we can probably also include the file and folder summaries
// for example ... if there was a change in /app/utils/openai.ts, we could inlude the summary of app, of utils, and of openai.ts file (at the top of the prompt)

// 1. for all the changes, generate short, but super detailed (i.e. mentiones names, functions names, paths, etc...) explanations of the code (perhaps for the explanation of what the original code does, we can include the summary we already have!), and the changes.
// 2. Use LLM to group related changes (into buckets essentially), then we input all of the grouped (relevant) changes together (their entire code .dif) into a single prompt to create a changelog for that specific section (i.e. for those similar changes, e.g: "made the scraping more performant by ... ")
// 2.05. For each of these diffs... we can include the contextual summaries ^^^ like we mentioned above... AND if the tokens >>> we can just use summaries instead of the actual diffs.
// 2.1. this changelog should be extremely detailed - since it will be passed further down to places that have no context.
// 2.2. If too much code to compile together, apply level of summarization and try again.

// 3. Lets combine all of these changelogs together to form the final v0.1
// should probably have some prompt that is like, "here are the changes that happened in the following files ... then summary of files, summary of the folders, etc..."
// OR... perhaps at the top we can include summaries of all the files AND folders (unique) that were changed?

// 3.1 this should return a very good bullet point list (perhaps have it return a structured output? )

// then we will pass it through another llm which is essentially a "questioner?", i.e. it acts like an end user would, and asks questions about the changes.
// need extremely detailed questiosn with the intention of being able to find the answer in the codebase.
// for example if the changelog says something like "Added batching to the getLinks function"
// the question should be something like "What is the getLinks function used for? How does an end user benefit from this?"
// and we might find an answe that says "..." which enhances the changelog -> "improved the scraping performance of the websie connector by batching our links processing"

// Essentially the main thing this llm will try to do is:
import { createId } from "@paralleldrive/cuid2";
import { Prisma, Repo } from "@prisma/client";
import { Job } from "bullmq";
import invariant from "tiny-invariant";
import { prisma } from "~/db.server";
import { augmentChunk } from "~/prompts/augmentChunk";
import { generateChunkBasedQuestions } from "~/prompts/generateChunkBasedQuestions.server";
import { embed } from "~/utils/openai";
import { Queue } from "~/utils/queue.server";

export interface QueueData {
  repo: Repo;
}

export interface Chunk {
  id: string;
  repoId: string;
  content: string;
}

const CHUNK_SIZE = 2048;
const OVERLAP = 256;
const BATCH_SIZE = 100;

export const queue = Queue<QueueData>("ingest", async (job) => {
  const children = await job.getChildrenValues();

  let repo;
  if (Object.keys(children).length > 0) {
    repo = Object.values(children)[0];
  } else {
    repo = job.data.repo;
  }

  invariant(repo?.id === job.data.repo.id, "Repo ids should match");

  const sessionId = createId();

  try {
    let progress = 0;

    // update the document to be pending

    const [deleteResult, progressUpdateResult, pendingUpdateResult] =
      await Promise.allSettled([
        prisma.$executeRaw`DELETE FROM "Embedding" WHERE "documentId" = ${document.id}`,
        job.updateProgress(progress),
        updateDocument({
          id: document.id,
          data: {
            isPending: true,
          },
        }),
      ]);

    // Handle results and errors
    if (deleteResult.status === "rejected") {
      console.error(
        "Failed to delete existing embeddings:",
        deleteResult.reason
      );
      throw new Error("Failed to delete existing embeddings");
    }

    const chunks: Chunk[] = splitStringIntoChunks(
      document,
      CHUNK_SIZE,
      OVERLAP
    );

    const totalChunks = chunks.length;
    const progressPerChunk = 100 / totalChunks;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      const settledResults = await Promise.allSettled(
        batch.map(async (chunk) => {
          const [augmentationResult, possibleQuestionsResult] =
            await Promise.allSettled([
              augmentChunk({ chunk, sessionId }),
              generateChunkBasedQuestions({ chunk, sessionId }),
            ]);

          return {
            chunk,
            augmentationResult,
            possibleQuestionsResult,
          };
        })
      );

      const embeddingsToCreate: {
        chunkContent: string;
        content: string;
        documentId: string;
        chatbotId: string;
      }[] = [];

      for (const result of settledResults) {
        if (result.status === "fulfilled") {
          const { chunk, augmentationResult, possibleQuestionsResult } =
            result.value;

          embeddingsToCreate.push({
            content: chunk.content,
            chunkContent: chunk.content,
            documentId: chunk.documentId,
            chatbotId: chunk.chatbotId,
          });

          if (
            possibleQuestionsResult.status === "fulfilled" &&
            possibleQuestionsResult.value
          ) {
            const possibleQuestions = possibleQuestionsResult.value;
            embeddingsToCreate.push(
              ...possibleQuestions.generatedQuestions.map((q) => ({
                content: q,
                chunkContent: chunk.content,
                documentId: chunk.documentId,
                chatbotId: chunk.chatbotId,
              }))
              // ...possibleQuestions.mainTopics.map((t) => ({
              //   content: t,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // })),
            );
          } else if (possibleQuestionsResult.status === "rejected") {
            console.error(
              "Failed to generate possible questions:",
              possibleQuestionsResult.reason
            );
          }

          if (
            augmentationResult.status === "fulfilled" &&
            augmentationResult.value
          ) {
            const augmentation = augmentationResult.value;
            embeddingsToCreate.push(
              {
                content: augmentation.conciseSummary,
                chunkContent: chunk.content,
                documentId: chunk.documentId,
                chatbotId: chunk.chatbotId,
              },
              ...augmentation.keyPoints.map((point) => ({
                content: point,
                chunkContent: chunk.content,
                documentId: chunk.documentId,
                chatbotId: chunk.chatbotId,
              })),
              {
                content: augmentation.rephrasedVersion,
                chunkContent: chunk.content,
                documentId: chunk.documentId,
                chatbotId: chunk.chatbotId,
              },
              {
                content: augmentation.simplifiedVersion,
                chunkContent: chunk.content,
                documentId: chunk.documentId,
                chatbotId: chunk.chatbotId,
              }
              // ...augmentation.keywords.map((keyword) => ({
              //   content: keyword,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // })),
              // ...augmentation.semanticVariations.map((variation) => ({
              //   content: variation,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // })),
              // ...augmentation.mainTopics.map((topic) => ({
              //   content: topic,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // })),
              // ...augmentation.entities.map((entity) => ({
              //   content: entity,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // })),
              // {
              //   content: augmentation.toneAndStyle,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // },
              // {
              //   content: augmentation.contentType,
              //   chunkContent: chunk.content,
              //   documentId: chunk.documentId,
              //   chatbotId: chunk.chatbotId,
              // },
            );
          } else if (augmentationResult.status === "rejected") {
            console.error(
              "Failed to augment chunk:",
              augmentationResult.reason
            );
          }
        } else {
          console.error("Failed to process chunk:", result.reason);
        }
      }

      await batchProcessEmbeddings(
        embeddingsToCreate,
        document,
        job,
        progressPerChunk * batch.length,
        "/ingestion/embeddings",
        document.name || "Unnamed Document",
        sessionId
      );

      progress += progressPerChunk * batch.length;
      await job.updateProgress(Math.min(progress, 100));
    }

    console.log(`ingestion.server.ts - current progress: ${progress}`);
    console.log(
      "ingestion.server.ts - finished ingestion job for document: ",
      document?.id
    );

    await updateDocument({
      id: document.id,
      data: {
        isPending: false,
      },
    });
  } catch (error) {
    console.error("ingestion.server.ts - error during ingestion job:", error);
    throw error;
  }
});

async function batchProcessEmbeddings(
  embeddingsToCreate: {
    chunkContent: string;
    content: string;
    documentId: string;
    chatbotId: string;
  }[],
  document: Document,
  job: Job<QueueData>,
  progressIncrement: number,
  sessionPath: string,
  sessionName: string,
  sessionId: string
) {
  const EMBEDDING_BATCH_SIZE = 100;
  let progress = 0;

  console.log("batch processing embeddings: ", embeddingsToCreate.length);

  for (let i = 0; i < embeddingsToCreate.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingsToCreate.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchContents = batch.map((item) => item.content);

    console.log("embedding batch contents: ", batchContents.length);
    const embeddings = await embed({
      input: batchContents,
      sessionId,
      sessionPath,
      sessionName,
    });

    console.log("embedded batch contents: ", embeddings.length);

    await insertEmbeddingsBatch(batch, embeddings as number[][], document);

    progress += progressIncrement * (batch.length / embeddingsToCreate.length);
    await job.updateProgress(Math.min(progress, 100));
  }
}

async function insertEmbeddingsBatch(
  batch: {
    content: string;
    chunkContent: string;
    documentId: string;
    chatbotId: string;
  }[],
  embeddings: number[][],
  document: Document
) {
  const values = batch.map((item, index) => ({
    id: createId(),
    embedding: embeddings[index],
    documentId: item.documentId,
    chatbotId: item.chatbotId,
    content: item.chunkContent,
  }));

  console.log("inserting embeddings: ", values.length);

  const sqlQuery = Prisma.sql`
    INSERT INTO "Embedding" ("id", "embedding", "documentId", "chatbotId", "content")
    VALUES ${Prisma.join(
      values.map(
        (v) =>
          Prisma.sql`(${v.id}, ${v.embedding}::vector, ${v.documentId}, ${v.chatbotId}, ${v.content})`
      )
    )}
  `;

  await prisma.$executeRaw(sqlQuery);
}

// TODO: This will be done with Jina segmentation in the future
export function splitStringIntoChunks(
  document: Document,
  chunkSize: number,
  overlap: number
): Chunk[] {
  invariant(document.content, "Document content is required");
  if (chunkSize <= 0) {
    throw new Error("Chunk size must be greater than 0.");
  }

  if (overlap >= chunkSize) {
    throw new Error("Overlap must be smaller than the chunk size.");
  }

  const chunks: Chunk[] = [];
  let startIndex = 0;

  while (startIndex < document.content.length) {
    const endIndex = Math.min(startIndex + chunkSize, document.content.length);
    const chunk = document.content.substring(startIndex, endIndex);
    const chunkId = createId();
    chunks.push({
      content: chunk,
      id: chunkId,
      documentId: document.id,
      chatbotId: document.chatbotId,
    });
    startIndex += chunkSize - overlap;

    // If the overlap is greater than the remaining characters, break to avoid an empty chunk
    if (startIndex + overlap >= document.content.length) {
      break;
    }
  }

  return chunks;
}
