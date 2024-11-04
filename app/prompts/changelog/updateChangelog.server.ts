// updates a changelog based on context (q&a)

import { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";
import { anthropic } from "~/utils/providers.server";

// old system prompt
// const updateSystemPrompt = {
//   role: "system",
//   content: [
//     {
//       type: "text",
//       text: "You are a world-class Product Manager and Technical Writer specializing in creating clear, engaging, and user-focused changelogs. Your expertise lies in translating technical changes into meaningful updates that users care about.\n  \n  Key Principles:\n  1. Write for users, not developers\n  2. Focus on value and benefits, not technical details\n  3. Group related changes logically\n  4. Use clear, non-technical language\n  5. Highlight important changes prominently\n  \n  Remember:\n  - Users care about what they can do now, not how it works\n  - Highlight improvements in speed, reliability, or ease of use\n  - Be specific about feature changes\n  - Explain impact on existing workflows\n  - Keep it concise but informative`",
//     },
//   ],
// } as ChatCompletionMessageParam;

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
  } as MessageParam);

export async function updateChangelog({
  markdownTree,
  qaPairs,
}: {
  markdownTree: string;
  qaPairs: { question: string; answer: string }[];
}) {
  // const response = await openai.chat.completions.create(
  //   {
  //     messages: [
  //       updateSystemPrompt,
  //       updateUserPrompt({ markdownTree, qaPairs }),
  //     ],
  //     model: "gpt-4o",
  //     temperature: 0,
  //   },
  //   {
  //     headers: {
  //       "Helicone-Property-Environment": process.env.NODE_ENV,
  //     },
  //   }
  // );
  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    temperature: 0,
    system:
      "You are an expert at analyzing code changes and creating clear, concise changelogs. You will be provided with information about a pull request in two parts:\n\n1. A markdown tree showing changed files, where:\n   - Each node includes a summary describing its purpose\n   - Folder nodes explain the folder's role in the codebase\n   - Leaf nodes (files) contain summaries of actual changes made\n   - Note: You won't see actual code patches, only summaries of changes\n\n2. A Q&A section containing questions and answers about the changes, providing additional context about how these changes impact the codebase.\n\nYour task is to synthesize this information into a clear, concise changelog that:\n- Starts with a 2-3 sentence summary of the PR's main purpose and impact\n- Follows with a bullet-pointed list of significant changes\n- Focuses on meaningful changes and their effects on the system as a whole\n\nGuidelines for writing changes:\n- Each bullet point should be one clear, concise sentence\n- Focus on the impact and purpose of changes, not implementation details\n- Start each bullet with a verb in past tense (Added, Fixed, Improved, etc.)\n- Group related changes into single bullets instead of listing them separately\n- Only mention file paths if they're essential to understanding the change\n- Don't repeat information across multiple bullets\n- Prioritize user-facing changes and breaking changes\n- Include important technical changes that affect system behavior\n\nExample of a good changelog:\nThis PR implements automatic quality assessment and improvement features for chatbot responses, with significant restructuring of the chat components and message handling system.\n* Added `/app/queues/chat/answered/llm.server.ts` to analyze if chatbot responses fully address user queries using OpenAI's API\n* Added message revision system in `/app/routes/chatbots.$chatbotId.chat.$chatId/` with status badges and improvement flows\n* Moved chat components from `/app/components/chat/` to route-specific locations for better organization\n* Added message regeneration capability with proper history cleanup in `/app/routes/api.chat.$chatbotId.$sessionId/route.tsx`\n* Implemented SSE progress tracking for chat analysis and document ingestion in `/app/routes/api.analyze.$chatId.progress.tsx`\n\nExample of a bad changelog:\nThis PR makes several changes to the codebase including modifications to authentication, database schema, and UI components.\n* Updated auth.github.callback.tsx to use manual OAuth flow instead of authenticator.authenticate\n* Changed form submission method from POST to GET in login.tsx\n* Added new columns avatarUrl and displayName to User table\n* Modified foreign key relationships in Repo table for cascade deletion\n* Imported @radix-ui/react-checkbox and @radix-ui/react-presence packages\n* Updated the Card component to use React.forwardRef\n* Removed the Update model from schema.prisma\n* Added stargazersCount field with default value 0\n* Changed token validation in session.server.ts\n* Modified error handling for missing GitHub credentials\n\nNotice how the bad example:\n- Lists implementation details instead of meaningful changes\n- Focuses on individual file changes rather than system impact\n- Includes unnecessary technical details about database schema\n- Mentions package installations that don't matter to users\n- Lists minor code modifications that have no user impact\n- Lacks context about why changes were made\n- Doesn't group related changes together",
    messages: [updateUserPrompt({ markdownTree, qaPairs })],
  });

  if (response.content[0].type !== "text") {
    throw new Error("Expected text response from Anthropic API");
  }

  return response.content[0].text;
}
