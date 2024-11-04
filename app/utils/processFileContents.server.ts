// import { octokit } from "~/utils/providers.server";
import { Chunk, RepoNodeWithRepo } from "../queues/ingestion/ingestFile.server";
import { createGitHubClient } from "./providers.server";

export function normalizeContentWithLineMap(content: string): {
  normalizedContent: string;
  totalLines: number;
  lineMap: Map<number, { start: number; end: number }>;
} {
  // Normalize line endings to \n while keeping track of original positions
  let normalizedContent = "";
  const lineMap = new Map<number, { start: number; end: number }>();
  let currentLine = 1;
  let lastIndex = 0;
  let currentPosition = 0;

  // Handle all types of line endings: \r\n, \n, \r
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === "\r" || char === "\n") {
      // Store the line boundary positions
      lineMap.set(currentLine, {
        start: lastIndex,
        end: i,
      });

      // Handle \r\n as a single line ending
      if (char === "\r" && nextChar === "\n") {
        normalizedContent += content.slice(lastIndex, i) + "\n";
        i++; // Skip the \n in next iteration
        lastIndex = i + 1;
      } else {
        normalizedContent += content.slice(lastIndex, i) + "\n";
        lastIndex = i + 1;
      }

      currentLine++;
      currentPosition = lastIndex;
    }
  }

  // Handle the last line
  if (lastIndex < content.length) {
    lineMap.set(currentLine, {
      start: lastIndex,
      end: content.length,
    });
    normalizedContent += content.slice(lastIndex);
  }

  return {
    normalizedContent,
    totalLines: currentLine,
    lineMap,
  };
}

export async function splitRepoNodeIntoChunks({
  node,
  chunkSize,
  overlap,
  githubAccessToken,
}: {
  node: RepoNodeWithRepo;
  chunkSize: number;
  overlap: number;
  githubAccessToken: string;
}): Promise<{
  nodeContent: string;
  chunks: Chunk[];
} | null> {
  try {
    const octokit = createGitHubClient(githubAccessToken);

    const { data: blobData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      {
        owner: node.repo.owner,
        repo: node.repo.name,
        file_sha: node.sha,
      }
    );

    const decodedContent = Buffer.from(blobData.content, "base64").toString(
      "utf-8"
    );

    if (decodedContent.trim() === "") {
      return null;
    }

    const { normalizedContent } = normalizeContentWithLineMap(decodedContent);

    const chunks: Chunk[] = [];
    const lines = normalizedContent.split("\n");

    // Add check for small files
    if (normalizedContent.length <= chunkSize) {
      chunks.push({
        content: normalizedContent,
        startLine: 1,
        endLine: lines.length,
        repoNodeId: node.id,
      });
      return {
        nodeContent: decodedContent,
        chunks,
      };
    }

    let currentPosition = 0;
    const overlapLines = Math.ceil(overlap / 80);

    while (currentPosition < lines.length) {
      let chunkEndPosition = currentPosition;
      let currentSize = 0;
      let breakPoint = -1;

      // find a good breaking point
      while (chunkEndPosition < lines.length && currentSize < chunkSize) {
        const line = lines[chunkEndPosition];
        currentSize += line.length + 1;

        if (currentSize <= chunkSize) {
          const trimmedLine = line.trim();

          if (
            trimmedLine === "" ||
            trimmedLine === "}" ||
            trimmedLine.endsWith("};") ||
            trimmedLine.match(/^(class|function|interface|type|const|let|var)/)
          ) {
            breakPoint = chunkEndPosition;
          }
        }

        chunkEndPosition++;
      }

      if (breakPoint === -1 || currentSize <= chunkSize) {
        breakPoint = chunkEndPosition - 1;
      }

      const chunkContent = lines
        .slice(currentPosition, breakPoint + 1)
        .join("\n");

      // Only add chunk if it's substantial (not just a few lines) and not empty
      if (chunkContent.trim() && chunkContent.split("\n").length > 3) {
        chunks.push({
          content: chunkContent,
          startLine: currentPosition + 1,
          endLine: breakPoint + 1,
          repoNodeId: node.id,
        });
      }

      // Modify the position advancement to prevent tiny chunks
      currentPosition = breakPoint + 1;
    }

    return {
      nodeContent: decodedContent,
      chunks,
    };
  } catch (error) {
    console.error("Error processing repo node:", error);
    return null;
  }
}
