import { z } from "zod";
import { prisma } from "~/db.server";
import { PatchSummarySchema } from "../prompts/changelog/sumarizePatch.server";

export interface ChangelogNode {
  path: string;
  type: "file" | "directory";
  upstreamSummary: string | null;
  children: ChangelogNode[];
  changes?: z.infer<typeof PatchSummarySchema> | null;
}

// Helper to get parent path - no need for path module
function getParentPath(filePath: string): string {
  if (filePath === "/" || !filePath.includes("/")) return "/";
  return filePath.substring(0, filePath.lastIndexOf("/"));
}

// Helper to get node name
function getNodeName(filePath: string): string {
  if (filePath === "/") return "/";
  return filePath.substring(filePath.lastIndexOf("/") + 1);
}

async function buildChangelogTree(
  repoId: string,
  changedFiles: Array<{
    path: string;
    changes: z.infer<typeof PatchSummarySchema> | null;
  }>
): Promise<ChangelogNode> {
  // Create root node
  const root: ChangelogNode = {
    path: "/",
    type: "directory",
    upstreamSummary: null,
    children: [],
  };

  // Create a map for quick node lookup
  const nodeMap = new Map<string, ChangelogNode>();
  nodeMap.set("/", root);

  // First pass: collect all unique directory paths
  const uniqueDirs = new Set<string>();
  changedFiles.forEach((file) => {
    let currentPath = file.path;
    while (currentPath !== "/") {
      currentPath = getParentPath(currentPath);
      uniqueDirs.add(currentPath);
    }
  });

  // Fetch all relevant RepoNodes in one query
  const repoNodes = await prisma.repoNode.findMany({
    where: {
      repoId,
      path: {
        in: [...uniqueDirs, ...changedFiles.map((f) => f.path)],
      },
    },
    select: {
      path: true,
      upstreamSummary: true,
    },
  });

  // Create a map of path to upstreamSummary
  const summaryMap = new Map(
    repoNodes.map((node) => [node.path, node.upstreamSummary])
  );

  // Create directory nodes first
  uniqueDirs.forEach((dirPath) => {
    if (!nodeMap.has(dirPath)) {
      nodeMap.set(dirPath, {
        path: dirPath,
        type: "directory",
        upstreamSummary: summaryMap.get(dirPath) ?? null,
        children: [],
      });
    }
  });

  // Add file nodes
  changedFiles.forEach((file) => {
    const fileNode: ChangelogNode = {
      path: file.path,
      type: "file",
      upstreamSummary: summaryMap.get(file.path) ?? null,
      children: [],
      changes: file.changes,
    };
    nodeMap.set(file.path, fileNode);

    // Add to parent
    const parentPath = getParentPath(file.path);
    const parentNode = nodeMap.get(parentPath);
    if (parentNode) {
      parentNode.children.push(fileNode);
    }
  });

  // Build the tree structure
  nodeMap.forEach((node, nodePath) => {
    if (nodePath === "/") return;
    const parentPath = getParentPath(nodePath);
    const parentNode = nodeMap.get(parentPath);
    if (parentNode && !parentNode.children.includes(node)) {
      parentNode.children.push(node);
    }
  });

  return root;
}

function generateMarkdownTree(node: ChangelogNode, level = 0): string {
  const indent = "  ".repeat(level);
  const lines: string[] = [];

  // Add node information
  if (node.path !== "/") {
    lines.push(`${indent}${getNodeName(node.path)}`);
    if (node.upstreamSummary) {
      lines.push(`${indent}  Summary: ${node.upstreamSummary}`);
    }
    if (node.changes) {
      lines.push(`${indent}  Changes:`);
      const changes = formatChanges(node);
      if (changes) {
        lines.push(
          changes
            .split("\n")
            .map((l) => `${indent}    ${l}`)
            .join("\n")
        );
      }
    }
  }

  // Sort children: directories first, then files, alphabetically
  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  // Add children
  sortedChildren.forEach((child) => {
    lines.push(generateMarkdownTree(child, level + 1));
  });

  return lines.join("\n");
}

function formatChanges(node: ChangelogNode): string {
  if (!node.changes) return "";

  const changes = node.changes;
  const lines = [];

  // Add primary change
  lines.push(`${changes.primary_change.description}`);

  // Add technical changes if present
  if (changes.technical_changes.length > 0) {
    lines.push("Technical changes:");
    changes.technical_changes.forEach((change) => {
      lines.push(`- ${change.details}`);
    });
  }

  // Add behavioral changes if present
  if (changes.impact_analysis.behavioral_changes.length > 0) {
    lines.push("Impact:");
    changes.impact_analysis.behavioral_changes.forEach((change) => {
      lines.push(`- ${change}`);
    });
  }

  return lines.join("\n");
}

export { buildChangelogTree, generateMarkdownTree };
