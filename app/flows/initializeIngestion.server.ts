import { FlowProducer } from "bullmq";
import { serverOnly$ } from "vite-env-only/macros";
import { createDAGQueue } from "~/queues/ingestion/createDAG.server";
import { pruningQueue } from "~/queues/ingestion/prune.server";
import { triggerLeafsQueue } from "~/queues/ingestion/triggerLeafs.server";
import { redis } from "~/utils/redis.server";

const flow = new FlowProducer({
  connection: redis,
});

// const trees = await flow.addBulk([
//   {
//     name: 'root-job-1',
//     queueName: 'rootQueueName-1',
//     data: {},
//     children: [
//       {
//         name,
//         data: { idx: 0, foo: 'bar' },
//         queueName: 'childrenQueueName-1',
//       },
//     ],
//   },
//   {
//     name: 'root-job-2',
//     queueName: 'rootQueueName-2',
//     data: {},
//     children: [
//       {
//         name,
//         data: { idx: 1, foo: 'baz' },
//         queueName: 'childrenQueueName-2',
//       },
//     ],
//   },
// ]);

// since we can add multiple repos at once, add flows in bulk
// need access token to be passed since it is saved in session so we get it from the request
// TODO - cache the repo from db? we get it in couple queues
export const initializeIngestionFlow = serverOnly$(
  async ({
    repoId,
    githubAccessToken,
  }: {
    repoId: string;
    githubAccessToken: string;
  }) => {
    if (!githubAccessToken) {
      throw new Error("GitHub access token is required");
    }

    console.log("repoId form inside", repoId);

    // make this accept an array of repoIds
    // repoId is the id in db - repo in db has the repo name and owner so we can fetch it
    // return await flow.add("initialize-ingestion", { repoUrl });
    // 1. prune
    // 2. create the DAG
    // 3. trigger leaf nodes
    // prune takes as data the repoId
    // returns:
    // {
    //   repoId: string;
    //   repo: GitHubTreeResponse;
    //   markdownTree: string;
    // }
    // the build DAG takes as data the repoId, repo GithubTreeResponse, and markdownTree (not needed)
    // do all the proper checks
    // build the DAG and update the db
    // return the repoId
    // 3. the trigger leaf nodes takes a repo id
    // makes sure there is some repo nodes
    // triggers the leafs

    const tree = await flow.add({
      name: `trigger-leafs-${repoId}`,
      queueName: triggerLeafsQueue.name,
      data: { repoId, githubAccessToken },
      children: [
        {
          name: `build-dag-${repoId}`,
          queueName: createDAGQueue.name,
          data: { repoId, githubAccessToken },
          children: [
            {
              name: `prune-${repoId}`,
              queueName: pruningQueue.name,
              data: { repoId, githubAccessToken },
            },
          ],
        },
      ],
    });

    return tree.job.id;
  }
);
