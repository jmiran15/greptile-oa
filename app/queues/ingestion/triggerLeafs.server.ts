import invariant from "tiny-invariant";
import { prisma } from "~/db.server";
import { DAGNode, deserializeDAG } from "~/utils/dag.server";
import { Queue } from "~/utils/queue.server";
import { fileIngestQueue } from "./ingestFile.server";

interface TriggerLeafsJobData {
  repoId: string;
  githubAccessToken: string;
}

const BATCH_SIZE = 100;

export const triggerLeafsQueue = Queue<TriggerLeafsJobData>(
  "triggerLeafs",
  async (job): Promise<{ repoId: string }> => {
    const children = await job.getChildrenValues();

    let dag: Map<string, DAGNode>;

    if (Object.keys(children).length > 0) {
      const dagObject = Object.values(children)[0];
      console.log("dagObject", dagObject);
      // Deserialize the DAG
      dag = deserializeDAG(dagObject.dag);
    } else {
      throw new Error("No repo prune data found");
    }

    invariant(dag?.size > 0, "DAG should have nodes");

    console.log("dag in trigger leafs", dag.size);

    // start processing all leaf nodes
    const leafNodes = Array.from(dag.values()).filter(
      (node) => node.type === "file" && node.children.size === 0
    );

    console.log("leaf nodes", leafNodes.length);

    // this could probably be a big flow that we just add all at once - but might cause memory issues if repo is too large
    // Process leaf nodes in batches
    for (let i = 0; i < leafNodes.length; i += BATCH_SIZE) {
      const batch = leafNodes.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((node) =>
          fileIngestQueue.add(`file-${node.id}`, {
            nodeId: node.id,
            repoId: job.data.repoId,
            path: node.path,
            githubAccessToken: job.data.githubAccessToken,
          })
        )
      );
    }

    await prisma.repo.update({
      where: { id: job.data.repoId },
      data: { finishedInitialization: true },
    });

    return {
      repoId: job.data.repoId,
    };
  }
);

// ============================== notes
// The codebase structure can be extremely large! so we need to be selective about what we decide is worth ingesting
// Step one is to prune anything from the codebase structure that is irrelevant to the codebase, and should not be embedded (e.g, config files, node_modules, package-lock.json, etc...)
// Then we need to begin the embedding process of everything.

// We take one file at a time ... okay lets think

// the basics should be fine no? Embed these things:
// summaries of the chunk
// relevant names of things being used and what they do
// possible quesitons
// the code itself

// maybe some other stuff that would make the rag really good - we can add more stuff later on!

// at inference time we can basically do the same stuff - just optimized for code.

// at this point, we SHOULD have a pruned github repo tree - i.e. only files that we actually need to process!

// this file should essentially just generate the flows (batched of course)

// 1. generate the DAG for the repo

// generate the flows based on the DAG + NOTE ... the leaf nodes need to be processed differently than the other nodes

// flow is like 1. call fileIngest queue on all the leaf nodes, then call folderIngest queue on all the other levels
// each level finishes, and passes the data to the next level
// please note that if the leaf nodes for a node are done, we should start processing the next level up, don't need to wait for the other nodes in the level to finish

// for now just make the DAG

// MORE NOTES =============
// TODO - very important last step ... once everything has been embedded and all the nodes have their summaries.
// do a simpler embedding process but top down (we initially did bottom up)
// this will allow us to create embeddings that have context in them from upstream nodes
// i.e. create a summary of this file, based on it's summary and it's upstream context.

// ingest a codebase
