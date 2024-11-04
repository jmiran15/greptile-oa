// TODO - update progress to include a status

import { prisma } from "~/db.server";
import { Queue } from "~/utils/queue.server";
import { folderPossibleQuestions } from "../../prompts/ingestion/folder/possibleQuestions.server";
import { folderSummary } from "../../prompts/ingestion/folder/summary.server";
import {
  batchProcessEmbeddings,
  updateRepoNodeStatus,
} from "./ingestFile.server";

interface IngestFolderData {
  nodeId: string;
  repoId: string;
  path: string;
}

export const folderIngestQueue = Queue<IngestFolderData>(
  "folderIngest",
  async (job) => {
    const node = await prisma.repoNode.findUnique({
      where: {
        repoId_path: {
          repoId: job.data.repoId,
          path: job.data.path,
        },
      },
      include: { children: true, repo: true },
    });

    if (!node) {
      await updateRepoNodeStatus(job.data.nodeId, "completed");
      return await job.moveToCompleted(null, "Node not found");
    }

    if (node.children.some((child) => !child.upstreamSummary)) {
      return;
    }

    if (node.children.length === 0) {
      await updateRepoNodeStatus(node.id, "completed");
      return await checkAndTriggerParent(node.id);
    }

    if (node.children.length === 1) {
      // special case - just pass up the summary of the child
      await prisma.repoNode.update({
        where: { id: node.id },
        data: {
          upstreamSummary: node.children[0].upstreamSummary,
          status: "completed",
        },
      });

      return await checkAndTriggerParent(node.id);
    }

    // pending
    // processing
    // summarizing
    // embedding
    // completed
    // failed

    await updateRepoNodeStatus(node.id, "processing");
    await job.updateProgress({
      status: "processing",
    });

    // based on all of those summaries, create a new summary for the folder
    // if more than 10 children, select 10 at random
    const validChildren = node.children.filter(
      (child) => child.upstreamSummary
    );
    const selectedChildren =
      validChildren.length > 10
        ? Array.from({ length: 10 }, () => {
            const randomIndex = Math.floor(
              Math.random() * validChildren.length
            );
            const [selected] = validChildren.splice(randomIndex, 1);
            return selected;
          })
        : validChildren;

    const childrenSummaries = selectedChildren
      .map(
        (child) =>
          `Path: ${child.path}\nType: ${child.type}\nSummary: ${child.upstreamSummary}`
      )
      .join("\n\n");

    await updateRepoNodeStatus(node.id, "summarizing");
    await job.updateProgress({
      status: "summarizing",
    });

    const summary = await folderSummary({
      folderPath: node.path,
      childrenLength: node.children.length,
      childrenSummaries,
    });

    // also based on all of these summaries, create possible questions for this folder
    const questions = await folderPossibleQuestions({
      folderPath: node.path,
      childrenLength: node.children.length,
      childrenSummaries,
    });

    const assumedContent = summary?.summary ?? node.path;

    // save the summary  (we will also do downstream pass here)
    await updateRepoNodeStatus(node.id, "embedding");
    await job.updateProgress({
      status: "embedding",
    });

    await batchProcessEmbeddings(
      [
        ...(summary
          ? [
              {
                embeddedContent: summary.summary,
                chunkContent: assumedContent,
                repoId: node.repoId,
                nodeId: node.id,
              },
              ...summary.key_elements.map((key_element) => ({
                embeddedContent: `${key_element.type}: ${key_element.name} - ${key_element.description}`,
                chunkContent: assumedContent,
                repoId: node.repoId,
                nodeId: node.id,
              })),
              {
                embeddedContent: summary.architectural_details.primary_purpose,
                chunkContent: assumedContent,
                repoId: node.repoId,
                nodeId: node.id,
              },
            ]
          : []),
        ...(questions
          ? [
              ...questions.functionality_questions.map((q) => ({
                embeddedContent: q.question,
                chunkContent: assumedContent,
                repoId: node.repoId,
                nodeId: node.id,
              })),
            ]
          : []),
      ],
      node
    );

    await prisma.$transaction([
      prisma.repoNode.update({
        where: {
          id: node.id,
        },
        data: {
          upstreamSummary: summary?.summary,
          status: "completed",
        },
      }),
      prisma.repo.update({
        where: { id: node.repoId },
        data: { ingested: true },
      }),
    ]);

    // use this to redirect immediately after completion
    await job.updateProgress({
      finishedIngestion: true,
    });

    // Check if parent is ready to process
    return await checkAndTriggerParent(node.id);

    // TODO - implement the downstream pass
    // one of these will be the root.
    // once we get to it - at the end, we need to initiated the downstream pass

    // we know these to be true because we set them that way - might be better to set a flag
    // path: "/",
    // type: "folder",

    // TODO - implement this (depending on performance)
    // if (
    //   updatedRepoNode.path === "/" &&
    //   updatedRepoNode.status === "completed" &&
    //   updatedRepoNode.type === "folder"
    // ) {
    //   await checkAndTriggerDownstream(updatedRepoNode.id);
    // }
  }
);

export async function checkAndTriggerDownstream(nodeId: string) {
  // TODO - implement this
  // should prob be a call to a downstreamNodeQueue
  // this queue does all the necessary stuff and at the end checks if it has children to pass info to
  // -----
  // get its parent - if none, call next
  // get the parents upstream summary
  // combine it with the node's upstream summary for better context
  // update the node's downstream summary
  // embed the downstream summary
  //IF it has children -  notify them to update their downstreamSummary
}

export async function checkAndTriggerParent(nodeId: string) {
  const node = await prisma.repoNode.findUnique({
    where: { id: nodeId },
    include: { parent: { include: { children: true } } },
  });

  console.log("node parent", node?.parent);

  if (!node?.parent) return;

  // const allChildrenCompleted = node.parent.children.every(
  //   (child) => child.status === "completed"
  // );

  // since we are calling before the children are completed, we need to check if they have a summary
  const allChildrenHaveSummary = node.parent.children.every(
    (child) => child.upstreamSummary
  );

  if (allChildrenHaveSummary) {
    const queueData = {
      nodeId: node.parent.id,
      repoId: node.parent.repoId,
      path: node.parent.path,
    };

    // assert that the parent is a folder
    if (node.parent.type !== "folder") {
      throw new Error("Parent is not a folder");
    }

    await folderIngestQueue.add(`folder-${node.parent.id}`, queueData);
  }
}
