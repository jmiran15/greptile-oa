import { prisma } from "~/db.server";
import { Queue } from "~/utils/queue.server";
import { folderPossibleQuestions } from "../../prompts/ingestion/folder/possibleQuestions.server";
import { folderSummary } from "../../prompts/ingestion/folder/summary.server";
import { batchProcessEmbeddings, fileIngestQueue } from "./ingestFile.server";

interface IngestFolderData {
  nodeId: string;
  repoId: string;
  path: string;
}

export const folderIngestQueue = Queue<IngestFolderData>(
  "folderIngest",
  async (job) => {
    // do all the stuff ...
    // get all of it's children summaries

    const node = await prisma.repoNode.findUnique({
      where: { id: job.data.nodeId },
      include: { children: true, repo: true },
    });

    if (!node) {
      return;
    }

    if (node.children.some((child) => child.status !== "completed")) {
      return;
    }

    if (node.children.length === 0) {
      return await checkAndTriggerParent(node.id);
    }

    if (node.children.length === 1) {
      // special case - just pass up the summary of the child
      const updatedFolderNode = await prisma.repoNode.update({
        where: { id: node.id },
        data: {
          upstreamSummary: node.children[0].upstreamSummary,
          status: "completed",
        },
      });

      return await checkAndTriggerParent(node.id);
    }

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

    const summary = await folderSummary({
      folderPath: node.path,
      childrenLength: node.children.length,
      childrenSummaries,
    });

    console.log("generated summary for parent node: ", summary);

    // also based on all of these summaries, create possible questions for this folder

    const questions = await folderPossibleQuestions({
      folderPath: node.path,
      childrenLength: node.children.length,
      childrenSummaries,
    });

    const assumedContent = summary?.summary ?? node.path;

    // save the summary  (we will also do downstream pass here)

    // embed

    // TODO - embed this stuff!
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

    // TODO - add the file summary to the node.summary in the db
    const updatedRepoNode = await prisma.repoNode.update({
      where: {
        id: node.id,
      },
      data: {
        upstreamSummary: summary?.summary,
        status: "completed",
      },
    });

    // Check if parent is ready to process
    await checkAndTriggerParent(node.id);

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

  if (!node?.parent) return;

  const allChildrenCompleted = node.parent.children.every(
    (child) => child.status === "completed"
  );

  if (allChildrenCompleted) {
    const queueData = {
      nodeId: node.parent.id,
      repoId: node.parent.repoId,
      path: node.parent.path,
    };

    // TODO - should never hit - files don't have files
    if (node.parent.type === "file") {
      await fileIngestQueue.add(`file-${node.parent.id}`, queueData);
    } else {
      await folderIngestQueue.add(`folder-${node.parent.id}`, queueData);
    }
  }
}
