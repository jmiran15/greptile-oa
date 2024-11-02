// TODO - filter out any empty files and empty dirs (i.e. size 0 files)

import { z } from "zod";
import { prisma } from "~/db.server";
import { pruneRepoTree, PruneResultSchema } from "~/prompts/pruneRepoTree";
import { octokit } from "~/utils/providers.server";
import { Queue } from "~/utils/queue.server";
import {
  GitHubTreeResponse,
  githubTreeToMarkdown,
  preFilterGithubTree,
  TreeItem,
} from "~/utils/treeProcessing.server";
import { ingestQueue } from "./ingest.server";

interface PruneTreesResult {
  githubTree: GitHubTreeResponse;
  markdownTree: string;
  appliedPruning: {
    successful: Array<{ path: string; reason: string }>;
    failed: Array<{ path: string; reason: string }>;
  };
}

export interface QueueData {
  repoUrl: string;
}

export const pruningQueue = Queue<QueueData>(
  "pruningFlow",
  async (
    job
  ): Promise<{
    repoId: string;
    repo: GitHubTreeResponse;
    markdownTree: string;
  }> => {
    // 1. lets save the repo in the db, and set isPending to true
    // 2. lets fetch the repo structure (tree) -> return the output
    // 3. lets get a repo structure, turn it into human readable tree, give to openai, return the "items to prune" - return pruned tree (in the same format as the input)
    // 4. begin ingestion process on the pruned tree

    // extract owner and repo from the url using regex
    const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)/;
    const match = job.data.repoUrl.match(regex);
    const owner = match![1];
    const repo = match![2];

    const { data: repoData } = await octokit.request(
      "GET /repos/{owner}/{repo}",
      {
        owner,
        repo,
      }
    );

    const defaultBranch = repoData.default_branch;

    const createdRepo = await prisma.repo.create({
      data: {
        repoUrl: job.data.repoUrl,
        isPending: true,
        owner,
        repo,
        defaultBranch,
      },
    });

    const { data: treeData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: "1",
      }
    );

    const filteredTree = preFilterGithubTree(treeData.tree, {
      maxFileSize: 1024 * 1024,
      includeDotFiles: false,
      includeTests: true,
    });

    const markdownTree = githubTreeToMarkdown({
      ...treeData,
      tree: filteredTree,
    });

    console.log("markdownTree\n", markdownTree);

    console.log("calling llm");

    console.time("pruning with llm");
    // TODO - this should go out to a queue
    const toPrune: z.infer<typeof PruneResultSchema> | null =
      await pruneRepoTree({
        markdownTree,
      });

    console.timeEnd("pruning with llm");

    if (!toPrune) {
      return {
        repoId: createdRepo.id,
        repo: {
          ...treeData,
          tree: filteredTree,
        },
        markdownTree,
      };
    }

    const prunedResults = pruneTreesFromAISuggestions({
      repo: { ...treeData, tree: filteredTree },
      toPrune,
    });

    // Log pruning results for monitoring
    console.log("Pruning results:", {
      successfulPrunes: prunedResults.appliedPruning.successful.length,
      failedPrunes: prunedResults.appliedPruning.failed.length,
    });

    console.log("final markdown tree: ", prunedResults.markdownTree);

    // TODO - this will be in a flow once we figure out types
    const createDAG = await ingestQueue.add(createdRepo.id, {
      repoId: createdRepo.id,
      tree: prunedResults.githubTree,
    });
    console.log("createDAG", createDAG);

    return {
      repoId: createdRepo.id,
      repo: prunedResults.githubTree,
      markdownTree: prunedResults.markdownTree,
    };
  }
);

export function pruneTreesFromAISuggestions({
  repo,
  toPrune,
}: {
  repo: GitHubTreeResponse;
  toPrune: z.infer<typeof PruneResultSchema>;
}): PruneTreesResult {
  const pathsToExclude = new Set<string>();

  // debugging
  const appliedPruning = {
    successful: [] as Array<{ path: string; reason: string }>,
    failed: [] as Array<{ path: string; reason: string }>,
  };

  for (const exclusion of toPrune.paths_to_exclude) {
    const path = exclusion.path.trim();

    const normalizedPath = path.replace(/\/+$/, "");

    const pathExists = repo.tree.some(
      (item: TreeItem) =>
        item.path === normalizedPath ||
        item.path.startsWith(normalizedPath + "/")
    );

    if (pathExists) {
      pathsToExclude.add(normalizedPath);
      appliedPruning.successful.push({
        path: normalizedPath,
        reason: `${exclusion.reason}: ${exclusion.explanation}`,
      });
    } else {
      appliedPruning.failed.push({
        path: normalizedPath,
        reason: `Path not found in repository`,
      });
    }
  }

  const prunedGithubTree = repo.tree.filter((item: TreeItem) => {
    if (pathsToExclude.has(item.path)) {
      return false;
    }

    for (const excludePath of pathsToExclude) {
      if (item.path.startsWith(excludePath + "/")) {
        return false;
      }
    }

    return true;
  });

  const newGithubResponse: GitHubTreeResponse = {
    ...repo,
    tree: prunedGithubTree,
  };

  const newMarkdownTree = githubTreeToMarkdown(newGithubResponse);

  return {
    githubTree: newGithubResponse,
    markdownTree: newMarkdownTree,
    appliedPruning,
  };
}
