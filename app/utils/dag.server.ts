import { createId } from "@paralleldrive/cuid2";
import type { RepoNode } from "@prisma/client";
import { prisma } from "~/db.server";
import { GitHubTreeResponse } from "./treeProcessing.server";

export interface DAGNode
  extends Pick<RepoNode, "id" | "path" | "type" | "status" | "url" | "sha"> {
  children: Set<string>;
  parent?: string;
}

export interface SerializedDAGNode extends Omit<DAGNode, "children"> {
  children: string[];
}

export async function buildDAGFromTree(
  repoId: string,
  tree: GitHubTreeResponse
): Promise<Map<string, DAGNode>> {
  const dag = new Map<string, DAGNode>();

  const rootNode: DAGNode = {
    id: createId(),
    path: "/",
    type: "folder",
    url: "",
    sha: "",
    children: new Set(),
    status: "pending",
  };
  dag.set("/", rootNode);

  for (const item of tree.tree) {
    const node: DAGNode = {
      id: createId(),
      path: item.path,
      type: item.type === "tree" ? "folder" : "file",
      url: item.url,
      children: new Set(),
      sha: item.sha,
      status: "pending",
    };
    dag.set(item.path, node);
  }

  for (const [path, node] of dag) {
    if (path === "/") continue;

    const pathParts = path.split("/");

    if (pathParts.length === 1) {
      node.parent = "/";
      rootNode.children.add(path);
    } else {
      const parentPath = pathParts.slice(0, -1).join("/");
      if (dag.has(parentPath)) {
        node.parent = parentPath;
        dag.get(parentPath)!.children.add(path);
      }
    }
  }

  try {
    await prisma.$transaction(
      Array.from(dag.values()).map((node) =>
        prisma.repoNode.upsert({
          where: {
            repoId_path: {
              repoId,
              path: node.path,
            },
          },
          create: {
            id: node.id,
            path: node.path,
            type: node.type,
            status: node.status,
            url: node.url,
            sha: node.sha,
            repoId,
            parentId: node.parent ? dag.get(node.parent)!.id : null,
          },
          update: {
            type: node.type,
            status: node.status,
            url: node.url,
            sha: node.sha,
            parentId: node.parent ? dag.get(node.parent)!.id : null,
          },
        })
      )
    );
  } catch (error) {
    console.error("Error upserting repo nodes", error);
  }

  return dag;
}

export function serializeDAG(
  dag: Map<string, DAGNode>
): Record<string, SerializedDAGNode> {
  const serialized: Record<string, SerializedDAGNode> = {};

  for (const [key, node] of dag.entries()) {
    serialized[key] = {
      ...node,
      children: Array.from(node.children),
    };
  }

  return serialized;
}

export function deserializeDAG(
  serializedDag: Record<string, SerializedDAGNode>
): Map<string, DAGNode> {
  const dag = new Map<string, DAGNode>();

  for (const [key, node] of Object.entries(serializedDag)) {
    dag.set(key, {
      ...node,
      children: new Set(node.children),
    });
  }

  return dag;
}
