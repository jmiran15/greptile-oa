// updates a changelog based on context (q&a)

import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { openai } from "~/utils/providers.server";

const updateSystemPrompt = {
  role: "system",
  content: [
    {
      type: "text",
      text: "You are a world-class Product Manager and Technical Writer specializing in creating clear, engaging, and user-focused changelogs. Your expertise lies in translating technical changes into meaningful updates that users care about.\n  \n  Key Principles:\n  1. Write for users, not developers\n  2. Focus on value and benefits, not technical details\n  3. Group related changes logically\n  4. Use clear, non-technical language\n  5. Highlight important changes prominently\n  \n  Remember:\n  - Users care about what they can do now, not how it works\n  - Highlight improvements in speed, reliability, or ease of use\n  - Be specific about feature changes\n  - Explain impact on existing workflows\n  - Keep it concise but informative`",
    },
  ],
} as ChatCompletionMessageParam;

const updateUserPrompt = ({
  markdownTree,
  qaPairs,
}: {
  markdownTree: string;
  qaPairs: { question: string; answer: string }[];
}) =>
  ({
    role: "user",
    content: [
      {
        type: "text",
        text: `Please create a user-friendly changelog based on the following information about code changes.\n  \n  Technical Changes Overview:\n  """\n  ${markdownTree}\n  """\n\n\nHere are some questions and answers which may provide some helpful information the changes\'\'\' relation to the codebase:\n"""\n${qaPairs.map(
          (qa) => `${qa.question} - ${qa.answer}`
        )}\n"""\n\nYour change log shoud be a bullet point list. Use paragraphs minimally. Your writing should be short. One sentence per change. Only use bulletpoints. Do not use any headings.`,
      },
    ],
  } as ChatCompletionMessageParam);

export async function updateChangelog({
  markdownTree,
  qaPairs,
}: {
  markdownTree: string;
  qaPairs: { question: string; answer: string }[];
}) {
  const response = await openai.chat.completions.create(
    {
      messages: [
        updateSystemPrompt,
        updateUserPrompt({ markdownTree, qaPairs }),
      ],
      model: "gpt-4o",
      temperature: 0,
    },
    {
      headers: {
        "Helicone-Property-Environment": process.env.NODE_ENV,
      },
    }
  );

  return response.choices[0].message.content;
}
