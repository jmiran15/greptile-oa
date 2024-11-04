// given a node
// get its downstream summary
// if it has children, notify them to update their downstreamSummary

import { ChangelogGenerationStatus } from "@prisma/client";
import { Job } from "bullmq";
import { z } from "zod";
import { prisma } from "~/db.server";
import { chat } from "~/utils/openai";
import { createGitHubClient } from "~/utils/providers.server";
import { Queue } from "~/utils/queue.server";
import {
  askQuestions,
  CodebaseQuestion,
} from "../../prompts/changelog/askCodebase.server";
import {
  PatchSummarySchema,
  summarizePatch,
} from "../../prompts/changelog/sumarizePatch.server";
import { updateChangelog } from "../../prompts/changelog/updateChangelog.server";
import {
  buildChangelogTree,
  generateMarkdownTree,
} from "../../utils/treeBuilder.server";

interface DiffEntry {
  sha: string;
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  patch?: string;
  previous_filename?: string;
}

type GitHubDiffResponse = DiffEntry[];
const CHANGELOG_BATCH_SIZE = 10;

async function updateGenerationStatus(
  job: Job,
  status: ChangelogGenerationStatus
) {
  await job.updateProgress({ status });
  await prisma.log.update({
    where: {
      id: job.data.logId,
    },
    data: {
      generationStatus: status,
    },
  });
}

export const generateChangelogQueue = Queue<{
  logId: string;
  repoId: string;
  githubAccessToken: string;
}>("generateChangelog", async (job) => {
  if (!job.data.logId || !job.data.githubAccessToken) {
    // set the job to completed and status to be some error
  }

  const log = await prisma.log.findUniqueOrThrow({
    where: {
      id: job.data.logId,
    },
    include: {
      repo: {
        select: {
          name: true,
          owner: true,
        },
      },
    },
  });

  if (!log.prNumber) {
    // no pr number to generate from, so do the same as in the first if - i.e. return with error
  }

  const octokit = createGitHubClient(job.data.githubAccessToken);
  const { data: repoData } = (await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
    {
      owner: log.repo.owner,
      repo: log.repo.name,
      pull_number: Number(log.prNumber),
    }
  )) as { data: GitHubDiffResponse };

  // TODO - add some preprocessing to the file changes
  // TODO - fetch some general / relevant info about the PR - ommitting for demo purposes

  const results: Array<{
    path: string;
    changes: z.infer<typeof PatchSummarySchema> | null;
  }> = [];

  await updateGenerationStatus(job, "summarizing");

  // Process files in batches
  for (let i = 0; i < repoData.length; i += CHANGELOG_BATCH_SIZE) {
    const batch = repoData.slice(i, i + CHANGELOG_BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch
        .filter((file) => file.patch !== undefined)
        .map(async (file) => {
          try {
            // find this node in the db
            const node = await prisma.repoNode.findUnique({
              where: {
                repoId_path: {
                  repoId: log.repoId,
                  path: file.filename,
                },
              },
            });

            // TODO - should probably pass more things ? e.g, additions, deletions, type, etc..
            const summary = await summarizePatch({
              patch: file.patch!,
              fileSummary: node?.upstreamSummary ?? "No file summary.",
            });

            return {
              path: file.filename,
              changes: summary,
            };
          } catch (error) {
            console.error(`Error processing file ${file.filename}:`, error);
            return {
              path: file.filename,
              changes: null,
            };
          }
        })
    );

    // Process batch results
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
      }
    }
  }

  await updateGenerationStatus(job, "context");

  // Build the tree and generate markdown
  const tree = await buildChangelogTree(log.repoId, results);
  const markdown = generateMarkdownTree(tree);
  const questions = await askQuestions({ markdownTree: markdown });
  const formattedQuestions = questions?.questions.map(formatQuestionAsQuery);

  // ask all the formatted questions

  // TODO - def batch this!
  const answers = formattedQuestions
    ? await Promise.all(
        formattedQuestions?.map((question) =>
          chat({ repoId: log.repoId, query: question })
        )
      )
    : [];

  const qaPairs = formattedQuestions?.map((question, index) => ({
    question,
    answer: answers[index]?.choices[0].message.content ?? "",
  }));

  await updateGenerationStatus(job, "updating");
  const changelogFinal = await updateChangelog({
    markdownTree: markdown,
    qaPairs: qaPairs?.filter((qa) => qa.answer !== "") ?? [],
  });

  const updatedChangelog = await prisma.log.update({
    where: {
      id: log.id,
    },
    data: {
      content: changelogFinal ?? log.content,
    },
  });

  await updateGenerationStatus(job, "completed");

  return {
    log: updatedChangelog,
    markdown,
    questions: formattedQuestions,
    changelog: changelogFinal,
  };
});

function formatQuestionAsQuery(question: z.infer<typeof CodebaseQuestion>) {
  const query = `
    ${question.question}.\n
    ${question.context.code_elements.join(", ")}.\n
    ${question.search_hints.join(", ")}.\n
    ${question.required_understanding.map((u) => `${u.concept}`).join(".\n")}
  `;

  return query;
}

// TODO - preprocess the patches statically - some things are obvious - like if a file was complretely deleted and added somewhere else, etc...
