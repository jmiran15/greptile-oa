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

// COMMENTS
// preprocess the patches statically - some things are obvious - like if a file was complretely deleted and added somewhere else, etc...

// create a summary of the changes in a file
// the prompt for this should be something like
// the patch <- description of the file (downstream summary) (so it has some context about file as a whole)

// ^ deal with changes that are too big to fit in one prompt -> recursive summarization

// We can chunk this IF too large to fit all into one prompt - preferably split by segments (i.e relevant stuff goes together)
// then i want to create a prompt like this:
// /app - summary of this folder
//   /utils - summary of this folder
//     /webscraper.ts - summary of this file
//        Changed ... and ... and ... ...
//     /webscraper.test.ts - summary of this file
//        Changed ... and ... and ... ...
//   /scraper - summary of this folder
//     /index.ts - summary of this file
//        Changed ... and ... and ... ...
// ...

// ask codebase

// create a final changelog with the answers

// maybe we can skip the grouping into buckets part
// then one prompt <- group together the change summaries into similar buckets (could be one?!)
// augment each bucket with a list of the relevant downstream summaries

// example:

// changes regarding the webscraper
// <- downstream summary of utils
//   <- downstream summary of scraper folder
//    <- downstream summary of webscraper.ts
//    <- summarized changes of webscraper.ts
//    <- downstream summary of webscraper.test.ts
//    <- summarized changes of webscraper.test.ts

// generate a changelog entry for each bucket
// make sure to mention that the changelog is for a PART of the PR and not the whole thing

// combine all the changelog entries

// ask llm for questions that would enhance the changelog

// get answers and enhance the changelog
