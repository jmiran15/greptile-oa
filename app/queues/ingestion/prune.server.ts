// TODO - filter out any empty files and empty dirs (i.e. size 0 files)

import invariant from "tiny-invariant";
import { z } from "zod";
import { prisma } from "~/db.server";
import {
  pruneRepoTree,
  PruneResultSchema,
} from "~/prompts/ingestion/pruneRepoTree.server";
import { createGitHubClient } from "~/utils/providers.server";
import { Queue } from "~/utils/queue.server";
import {
  GitHubTreeResponse,
  githubTreeToMarkdown,
  preFilterGithubTree,
  TreeItem,
} from "~/utils/treeProcessing.server";

interface PruneTreesResult {
  githubTree: GitHubTreeResponse;
  markdownTree: string;
  appliedPruning: {
    successful: Array<{ path: string; reason: string }>;
    failed: Array<{ path: string; reason: string }>;
  };
}

export interface QueueData {
  repoId: string;
  githubAccessToken: string;
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
    const repo = await prisma.repo.findUniqueOrThrow({
      where: {
        id: job.data.repoId,
      },
      select: {
        id: true,
        name: true,
        owner: true,
        defaultBranch: true,
      },
    });

    // initialize octokit
    const octokit = createGitHubClient(job.data.githubAccessToken);

    // Get all repositories the user has access to
    // const { data: repos } = await github.rest.repos.listForAuthenticatedUser({
    //   sort: "updated",
    //   per_page: 100,
    //   visibility: "all",
    // });

    const { data: repoData } = await octokit.request(
      "GET /repos/{owner}/{repo}",
      {
        owner: repo.owner,
        repo: repo.name,
      }
    );

    const defaultBranch = repoData.default_branch;

    invariant(
      defaultBranch === repo.defaultBranch,
      "Default branch should match the one in the db"
    );

    const { data: treeData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner: repo.owner,
        repo: repo.name,
        tree_sha: defaultBranch,
        recursive: "1",
      }
    );

    if (!treeData.tree) {
      throw new Error("No tree data found");
    }

    const filteredTree = preFilterGithubTree(treeData.tree as TreeItem[], {
      maxFileSize: 1024 * 1024,
      includeDotFiles: false,
      includeTests: true,
    });

    const markdownTree = githubTreeToMarkdown({
      ...treeData,
      tree: filteredTree,
    });

    // prune with llm as well
    // TODO - this should go out to a queue
    const toPrune: z.infer<typeof PruneResultSchema> | null =
      await pruneRepoTree({
        markdownTree,
      });

    if (!toPrune) {
      return {
        repoId: repo.id,
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

    // console.log("Pruning results:", {
    //   successfulPrunes: prunedResults.appliedPruning.successful.length,
    //   failedPrunes: prunedResults.appliedPruning.failed.length,
    // });

    return {
      repoId: repo.id,
      repo: prunedResults.githubTree,
      markdownTree: prunedResults.markdownTree,
    };
  }
);

// TODO - move this to util
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
