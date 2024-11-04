// TODO - update progress to include a status

import { createId } from "@paralleldrive/cuid2";
import { Prisma, Status } from "@prisma/client";
import { prisma } from "~/db.server";
import { openai } from "~/utils/providers.server";
import { Queue } from "~/utils/queue.server";
import { chunkPossibleQuestions } from "../../prompts/ingestion/file/chunkPossibleQuestions.server";
import { chunkSummary } from "../../prompts/ingestion/file/chunkSummary.server";
import {
  normalizeContentWithLineMap,
  splitRepoNodeIntoChunks,
} from "../../utils/processFileContents.server";
import { checkAndTriggerParent } from "./ingestFolder.server";

interface IngestFileData {
  nodeId: string;
  repoId: string;
  path: string;
  githubAccessToken: string;
}

interface EmbeddingsToCreate {
  embeddedContent: string;
  chunkContent: string;
  repoId: string;
  nodeId: string;
}

export interface Chunk {
  // id: string;
  repoNodeId: string;
  content: string;
  startLine: number;
  endLine: number;
}

export type RepoNodeWithRepo = Prisma.RepoNodeGetPayload<{
  include: {
    repo: {
      select: {
        owner: true;
        name: true;
      };
    };
  };
}>;

const CHUNK_SIZE = 2048 * 2;
const OVERLAP = 256;
const BATCH_SIZE = 100;

export function updateRepoNodeStatus(nodeId: string, status: Status) {
  return prisma.repoNode.update({
    where: { id: nodeId },
    data: { status },
  });
}

export const fileIngestQueue = Queue<IngestFileData>(
  "fileIngest",
  async (job) => {
    // get the node from the db
    const node = await prisma.repoNode.findUnique({
      where: {
        repoId_path: {
          repoId: job.data.repoId,
          path: job.data.path,
        },
      },
      include: {
        repo: {
          select: {
            owner: true,
            name: true,
          },
        },
      },
    });

    if (!node) {
      await updateRepoNodeStatus(job.data.nodeId, "completed");
      await job.updateProgress({
        status: "completed",
      });
      return await job.moveToCompleted(null, "Node not found");
    }

    try {
      let progress = 0;

      // TODO - this is for re-indexing an existing repo
      // deleting at the file level lets us re-index the file without re-indexing the entire repo

      const [deleteResult, progressUpdateResult, pendingUpdateResult] =
        await Promise.allSettled([
          prisma.$executeRaw`DELETE FROM "Embedding" WHERE "nodeId" = ${node.id}`,
          job.updateProgress({ percentage: progress, status: "processing" }),
          updateRepoNodeStatus(node.id, "processing"),
        ]);

      if (deleteResult.status === "rejected") {
        console.error(
          "Failed to delete existing embeddings:",
          deleteResult.reason
        );
        throw new Error("Failed to delete existing embeddings");
      }

      const chunks: { nodeContent: string; chunks: Chunk[] } | null =
        await splitRepoNodeIntoChunks({
          node,
          chunkSize: CHUNK_SIZE,
          overlap: OVERLAP,
          githubAccessToken: job.data.githubAccessToken,
        });

      if (!chunks) {
        await updateRepoNodeStatus(node.id, "completed");
        await job.updateProgress({
          status: "completed",
        });
        await prisma.repoNode.update({
          where: { id: node.id },
          data: {
            upstreamSummary: "This file is empty",
            status: "completed",
          },
        });
        return await checkAndTriggerParent(node.id);
      }

      const { lineMap } = normalizeContentWithLineMap(chunks.nodeContent);

      const beginningOfFile = chunks.nodeContent.slice(0, CHUNK_SIZE * 2);

      // Find the line number that corresponds to the end of beginningOfFile
      let endLine = 1;
      for (const [lineNum, { end }] of lineMap.entries()) {
        if (end >= beginningOfFile.length) {
          endLine = lineNum;
          break;
        }
      }

      await updateRepoNodeStatus(node.id, "summarizing");
      await job.updateProgress({
        status: "summarizing",
      });

      const fileSummary = await chunkSummary({
        filepath: node.path,
        startLine: 1,
        endLine,
        code: beginningOfFile,
      });

      const filePossibleQuestions = await chunkPossibleQuestions({
        filepath: node.path,
        startLine: 1,
        endLine,
        code: beginningOfFile,
      });

      await updateRepoNodeStatus(node.id, "embedding");
      await job.updateProgress({
        percentage: 0,
        status: "embedding",
      });

      await batchProcessEmbeddings(
        [
          ...(fileSummary
            ? [
                {
                  embeddedContent: fileSummary.summary,
                  chunkContent: beginningOfFile,
                  repoId: node.repoId,
                  nodeId: node.id,
                },
                ...fileSummary.key_elements.map((key_element) => ({
                  embeddedContent: `${key_element.type}: ${key_element.name} - ${key_element.description}`,
                  chunkContent: beginningOfFile,
                  repoId: node.repoId,
                  nodeId: node.id,
                })),
                {
                  embeddedContent:
                    fileSummary.technical_details.primary_purpose,
                  chunkContent: beginningOfFile,
                  repoId: node.repoId,
                  nodeId: node.id,
                },
              ]
            : []),
          ...(filePossibleQuestions
            ? [
                ...filePossibleQuestions.functionality_questions.map((q) => ({
                  embeddedContent: q.question,
                  chunkContent: beginningOfFile,
                  repoId: node.repoId,
                  nodeId: node.id,
                })),
              ]
            : []),
        ],
        node
      );

      await prisma.repoNode.update({
        where: {
          id: node.id,
        },
        data: {
          upstreamSummary: fileSummary?.summary,
        },
      });

      // trigger the parent to process here - speed things up
      await checkAndTriggerParent(node.id);

      const totalChunks = chunks.chunks.length;
      const progressPerChunk = 100 / totalChunks;

      // now we do the same thing for all the chunks (in batches)
      for (let i = 0; i < chunks.chunks.length; i += BATCH_SIZE) {
        const batch = chunks.chunks.slice(i, i + BATCH_SIZE);

        const settledResults = await Promise.allSettled(
          batch.map(async (chunk) => {
            const [summaryResult, possibleQuestionsResult] =
              await Promise.allSettled([
                chunkSummary({
                  filepath: node.path,
                  startLine: chunk.startLine,
                  endLine: chunk.endLine,
                  code: chunk.content,
                }),
                chunkPossibleQuestions({
                  filepath: node.path,
                  startLine: chunk.startLine,
                  endLine: chunk.endLine,
                  code: chunk.content,
                }),
              ]);

            return {
              chunk,
              summaryResult,
              possibleQuestionsResult,
            };
          })
        );

        const embeddingsToCreate: {
          embeddedContent: string;
          chunkContent: string;
          repoId: string;
          nodeId: string;
        }[] = [];

        for (const result of settledResults) {
          if (result.status === "fulfilled") {
            const { chunk, summaryResult, possibleQuestionsResult } =
              result.value;

            // embedding the actual code might be useless? not sure if the embedding catches anything
            embeddingsToCreate.push({
              embeddedContent: chunk.content,
              chunkContent: chunk.content,
              repoId: node.repoId,
              nodeId: node.id,
            });

            if (
              possibleQuestionsResult.status === "fulfilled" &&
              possibleQuestionsResult.value
            ) {
              const possibleQuestions = possibleQuestionsResult.value;

              embeddingsToCreate.push(
                ...possibleQuestions.functionality_questions.map((q) => ({
                  embeddedContent: q.question,
                  chunkContent: chunk.content,
                  repoId: node.repoId,
                  nodeId: node.id,
                }))
              );
            } else if (possibleQuestionsResult.status === "rejected") {
              console.error(
                "Failed to generate possible questions:",
                possibleQuestionsResult.reason
              );
            }

            if (summaryResult.status === "fulfilled" && summaryResult.value) {
              const augmentation = summaryResult.value;

              embeddingsToCreate.push(
                {
                  embeddedContent: augmentation.summary,
                  chunkContent: chunk.content,
                  repoId: node.repoId,
                  nodeId: node.id,
                },
                ...augmentation.key_elements.map((key_element) => ({
                  embeddedContent: `${key_element.type}: ${key_element.name} - ${key_element.description}`,
                  chunkContent: chunk.content,
                  repoId: node.repoId,
                  nodeId: node.id,
                })),
                {
                  embeddedContent:
                    augmentation.technical_details.primary_purpose,
                  chunkContent: chunk.content,
                  repoId: node.repoId,
                  nodeId: node.id,
                }
              );
            } else if (summaryResult.status === "rejected") {
              console.error("Failed to augment chunk:", summaryResult.reason);
            }
          } else {
            console.error("Failed to process chunk:", result.reason);
          }
        }

        await batchProcessEmbeddings(embeddingsToCreate, node);

        progress += progressPerChunk * batch.length;
        await job.updateProgress({
          percentage: Math.min(progress, 100),
          status: "embedding",
        });
      }

      return await updateRepoNodeStatus(node.id, "completed");

      // check if parent is ready to process
      // TODO - check if we need this here? return await checkAndTriggerParent(node.id);
    } catch (error) {
      console.error("Error ingesting file:", error);
    }
  }
);

export async function batchProcessEmbeddings(
  embeddingsToCreate: EmbeddingsToCreate[],
  repoNode: RepoNodeWithRepo
) {
  const EMBEDDING_BATCH_SIZE = 40;

  for (let i = 0; i < embeddingsToCreate.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingsToCreate.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchContents = batch.map((item) => item.embeddedContent);

    const embeddings = await embed({
      input: batchContents,
    });

    await insertEmbeddingsBatch(batch, embeddings as number[][], repoNode);
  }
}

async function insertEmbeddingsBatch(
  batch: EmbeddingsToCreate[],
  embeddings: number[][],
  repoNode: RepoNodeWithRepo
) {
  const values = batch.map((item, index) => ({
    id: createId(),
    embedding: embeddings[index],
    repoId: repoNode.repoId,
    nodeId: repoNode.id,
    embeddedContent: item.embeddedContent,
    chunkContent: item.chunkContent,
  }));

  const sqlQuery = Prisma.sql`
    INSERT INTO "Embedding" ("id", "embedding", "repoId", "nodeId", "embeddedContent", "chunkContent")
    VALUES ${Prisma.join(
      values.map(
        (v) =>
          Prisma.sql`(${v.id}, ${v.embedding}::vector, ${v.repoId}, ${v.nodeId}, ${v.embeddedContent}, ${v.chunkContent})`
      )
    )}
  `;

  try {
    await prisma.$executeRaw(sqlQuery);
  } catch (error) {
    console.error("Error inserting embeddings batch:", error);
  }
}

export async function embed({
  input,
}: {
  input: string | string[];
}): Promise<number[] | number[][]> {
  try {
    const embedding = await openai.embeddings.create(
      {
        model: "text-embedding-3-small",
        input: Array.isArray(input)
          ? input.map((i) => i.replace(/\n/g, " "))
          : input.replace(/\n/g, " "),
        encoding_format: "float",
      },
      {
        headers: {
          "Helicone-Property-Environment": process.env.NODE_ENV,
        },
      }
    );

    return Array.isArray(input)
      ? embedding.data.map((e) => e.embedding as number[])
      : (embedding.data[0].embedding as number[]);
  } catch (e) {
    throw new Error(`Error calling OpenAI embedding API: ${e}`);
  }
}
