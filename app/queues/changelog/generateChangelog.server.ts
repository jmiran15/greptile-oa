// given a node
// get its downstream summary
// if it has children, notify them to update their downstreamSummary

import { z } from "zod";
import { prisma } from "~/db.server";
import { chat } from "~/utils/openai";
import { octokit } from "~/utils/providers.server";
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

export const generateChangelogQueue = Queue<{ prPath: string; repoId: string }>(
  "generateChangelog",
  async (job) => {
    // fetch the pr data

    // prPath looks something like: https://github.com/jmiran15/chatmate/pull/9

    // /repos/{owner}/{repo}/pulls/{pull_number}

    const regex = /https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
    const match = job.data.prPath.match(regex);
    const owner = match![1];
    const repo = match![2];
    const pullNumber = match![3];

    const { data: repoData } = (await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      {
        owner,
        repo,
        pull_number: Number(pullNumber),
      }
    )) as { data: GitHubDiffResponse };

    // TODO - add some preprocessing to the file changes

    // TODO - fetch some general / relevant info about the PR - ommitting for demo purposes

    const results: Array<{
      path: string;
      changes: z.infer<typeof PatchSummarySchema> | null;
    }> = [];

    // Process files in batches
    for (let i = 0; i < repoData.length; i += CHANGELOG_BATCH_SIZE) {
      const batch = repoData.slice(i, i + CHANGELOG_BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch
          .filter((file) => file.patch !== undefined)
          .map(async (file) => {
            try {
              console.log("generating summary for: ", file.filename);
              // find this node in the db
              const node = await prisma.repoNode.findUnique({
                where: {
                  repoId_path: {
                    repoId: job.data.repoId,
                    path: file.filename,
                  },
                },
              });

              // TODO - should probably pass more things ? e.g, additions, deletions, type, etc..
              const summary = await summarizePatch({
                patch: file.patch!,
                fileSummary: node?.upstreamSummary ?? "No file summary.",
              });

              console.log("summary: ", summary);

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

    console.log("results: ", results);

    // Build the tree and generate markdown
    const tree = await buildChangelogTree(job.data.repoId, results);

    console.log("tree: ", tree);
    const markdown = generateMarkdownTree(tree);

    console.log("markdown: ", markdown);

    const questions = await askQuestions({ markdownTree: markdown });

    console.log("questions: ", questions);

    const formattedQuestions = questions?.questions.map(formatQuestionAsQuery);

    console.log("formatted questions: ", formattedQuestions?.join("\n\n\n"));

    // const result = await chat({ repoId, query });

    // ask all the formatted questions

    // TODO - def batch this!
    const answers = formattedQuestions
      ? await Promise.all(
          formattedQuestions?.map((question) =>
            chat({ repoId: job.data.repoId, query: question })
          )
        )
      : [];

    const qaPairs = formattedQuestions?.map((question, index) => ({
      question,
      answer: answers[index]?.choices[0].message.content ?? "",
    }));

    const changelogFinal = await updateChangelog({
      markdownTree: markdown,
      qaPairs: qaPairs?.filter((qa) => qa.answer !== "") ?? [],
    });

    // call update with the questions, answers, and markdown

    // finally -- tell it to ASK questions

    // Save to database
    // await prisma.pullRequest.update({
    //   where: {
    //     id: pullNumber.toString(),
    //   },
    //   data: {
    //     changelog,
    //     status: "completed",
    //   },
    // });

    return {
      markdown,
      questions: formattedQuestions,
      changelog: changelogFinal,
    };
  }
);

function formatQuestionAsQuery(question: z.infer<typeof CodebaseQuestion>) {
  const query = `
    ${question.question}.\n
    ${question.context.code_elements.join(", ")}.\n
    ${question.search_hints.join(", ")}.\n
    ${question.required_understanding.map((u) => `${u.concept}`).join(".\n")}
  `;

  return query;
}

// the plan

// first of all preprocess the patches statically - some things are obvious - like if a file was complretely deleted and added somewhere else, etc...

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
