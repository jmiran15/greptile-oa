// TODO - very important last step ... once everything has been embedded and all the nodes have their summaries.
// do a simpler embedding process but top down (we initially did bottom up)
// this will allow us to create embeddings that have context in them from upstream nodes
// i.e. create a summary of this file, based on it's summary and it's upstream context.

// ingest a codebase

import { buildDAGFromTree } from "~/utils/dag.server";
import { Queue } from "~/utils/queue.server";
import { GitHubTreeResponse } from "~/utils/treeProcessing.server";
import { fileIngestQueue } from "./ingestFile.server";

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
export const ingestQueue = Queue<{ repoId: string; tree: GitHubTreeResponse }>(
  "ingest",
  async (job) => {
    // Build DAG and store in database
    const dag = await buildDAGFromTree(job.data.repoId, job.data.tree);

    // return {
    //   dag,
    // };

    // Start processing all leaf nodes (files without children)
    const leafNodes = Array.from(dag.values()).filter(
      (node) => node.type === "file" && node.children.size === 0
    );

    // process the first one for testing
    // return await fileIngestQueue.add(`file-${leafNodes[1].id}`, {
    //   nodeId: leafNodes[1].id,
    //   repoId: job.data.repoId,
    //   path: leafNodes[1].path,
    // });

    // TODO - batch this - don't want to add too many jobs at once (Redis memory limit)

    // Add all leaf nodes to the fileIngest queue
    return await Promise.all(
      leafNodes.map((node) =>
        fileIngestQueue.add(`file-${node.id}`, {
          nodeId: node.id,
          repoId: job.data.repoId,
          path: node.path,
        })
      )
    );
  }
);
