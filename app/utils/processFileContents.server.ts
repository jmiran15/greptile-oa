import { octokit } from "~/utils/providers.server";
import { Chunk, RepoNodeWithRepo } from "../queues/ingestion/ingestFile.server";

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
}: {
  node: RepoNodeWithRepo;
  chunkSize: number;
  overlap: number;
}): Promise<{
  nodeContent: string;
  chunks: Chunk[];
} | null> {
  try {
    const { data: blobData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/blobs/{file_sha}",
      {
        owner: node.repo.owner,
        repo: node.repo.repo,
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
    let currentPosition = 0; // line number

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

      if (chunkContent.trim()) {
        chunks.push({
          content: chunkContent,
          startLine: currentPosition + 1,
          endLine: breakPoint + 1,
          repoNodeId: node.id,
        });
      }

      currentPosition = Math.max(
        currentPosition + 1,
        breakPoint - overlapLines
      );
    }

    // Improve chunk boundary adjustment with empty content check
    for (let i = 1; i < chunks.length; i++) {
      const currentChunk = chunks[i];

      const overlapLines = lines.slice(
        currentChunk.startLine - 1,
        currentChunk.startLine + 5
      );

      let adjustedStart = currentChunk.startLine;
      for (let j = 0; j < overlapLines.length; j++) {
        const line = overlapLines[j].trim();
        if (
          line.startsWith("function ") ||
          line.startsWith("class ") ||
          line.startsWith("interface ") ||
          line.startsWith("type ") ||
          line.startsWith("const ") ||
          line === "{" ||
          line === ""
        ) {
          adjustedStart = currentChunk.startLine + j;
          break;
        }
      }

      const newContent = lines
        .slice(adjustedStart - 1, chunks[i].endLine)
        .join("\n");
      // Only update the chunk if the new content isn't empty
      if (newContent.trim()) {
        chunks[i] = {
          content: newContent,
          startLine: adjustedStart,
          endLine: chunks[i].endLine,
          repoNodeId: node.id,
        };
      } else {
        // Remove the chunk if it becomes empty after adjustment
        chunks.splice(i, 1);
        i--; // Adjust the index since we removed an element
      }
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
