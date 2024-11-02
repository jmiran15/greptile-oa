import { FlowProducer } from "bullmq";
import { serverOnly$ } from "vite-env-only/macros";
import { redis } from "~/utils/redis.server";

const flow = new FlowProducer({
  connection: redis,
});

export const ingestionFlow = serverOnly$(
  async ({ repoUrl }: { repoUrl: string }) => {
    // {
    //     name: `ingestion-${document.id}`,
    //     queueName: ingestionQueue.name,
    //     data: { document },
    //     opts: {
    //       jobId: document.id,
    //     },
    //     children: [
    //       {
    //         name: `${preprocessingQueue.name}-${document.id}`,
    //         queueName: preprocessingQueue.name,
    //         data: { document },
    //       },
    //     ],
    //   }

    return await flow.add("ingest-repo", { repoUrl });
  }
);

// ingestion flow should do the following

// 1. lets save the repo in the db, and set isPending to true
// 2. lets fetch the repo structure (tree) -> return the output
// 3. lets get a repo structure, turn it into human readable tree, give to openai, return the "items to prune" - return pruned tree (in the same format as the input)
// 4. begin ingestion process on the pruned tree

// so we have 1. a pruning flow
// 2. an ingestion flow
