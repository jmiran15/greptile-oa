import invariant from "tiny-invariant";
import { buildDAGFromTree, DAGNode, serializeDAG } from "~/utils/dag.server";
import { Queue } from "~/utils/queue.server";
import { GitHubTreeResponse } from "~/utils/treeProcessing.server";

interface CreateDAGJobData {
  repoId: string;
}

interface CreateDAGChildren {
  repoId: string;
  repo: GitHubTreeResponse;
  markdownTree: string;
}

export const createDAGQueue = Queue<CreateDAGJobData>(
  "createDAG",
  async (job): Promise<{ repoId: string; dag: Record<string, DAGNode> }> => {
    // get the children data

    const children = await job.getChildrenValues();

    let child: CreateDAGChildren;

    if (Object.keys(children).length > 0) {
      child = Object.values(children)[0];
    } else {
      throw new Error("No repo prune data found");
    }

    invariant(child?.repoId === job.data.repoId, "Repo ids should match");

    // Build DAG and store in database
    const dag = await buildDAGFromTree(job.data.repoId, child.repo);

    // Serialize the DAG before returning
    return {
      repoId: job.data.repoId,
      dag: serializeDAG(dag),
    };
  }
);
