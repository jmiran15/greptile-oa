import { Status } from "@prisma/client";
import { useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  Position,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { NodeProgress } from "~/routes/api.repo.$repoId.progress";
import { SerializedDAGNode } from "~/utils/dag.server";

interface DAGProgressProps {
  nodeProgress: Record<string, NodeProgress>;
  dag: Record<string, SerializedDAGNode>;
}

function getStatusColor(status: Status) {
  switch (status) {
    case "completed":
      return "rgb(34 197 94)"; // green-500
    case "processing":
      return "rgb(59 130 246)"; // blue-500
    case "embedding":
      return "rgb(168 85 247)"; // purple-500
    case "summarizing":
      return "rgb(234 179 8)"; // yellow-500
    case "failed":
      return "rgb(239 68 68)"; // red-500
    default:
      return "rgb(156 163 175)"; // gray-400
  }
}

function calculateNodePositions(dag: Record<string, SerializedDAGNode>) {
  const levels = new Map<string, number>();
  const horizontalPositions = new Map<string, number>();
  const VERTICAL_SPACING = 120;
  const HORIZONTAL_SPACING = 250;

  // Calculate levels (distance from root)
  function getLevel(nodeId: string, visited = new Set<string>()): number {
    if (levels.has(nodeId)) return levels.get(nodeId)!;
    if (visited.has(nodeId)) return 0;

    visited.add(nodeId);
    const node = dag[nodeId];
    if (!node.parent) {
      levels.set(nodeId, 0);
      return 0;
    }

    const parentLevel = getLevel(node.parent, visited);
    const level = parentLevel + 1;
    levels.set(nodeId, level);
    return level;
  }

  // Calculate levels for all nodes
  Object.keys(dag).forEach((nodeId) => getLevel(nodeId));

  // Group nodes by level
  const nodesPerLevel = new Map<number, string[]>();
  Array.from(levels.entries()).forEach(([nodeId, level]) => {
    if (!nodesPerLevel.has(level)) {
      nodesPerLevel.set(level, []);
    }
    nodesPerLevel.get(level)!.push(nodeId);
  });

  // Calculate horizontal positions
  nodesPerLevel.forEach((nodeIds, level) => {
    const levelWidth = (nodeIds.length - 1) * HORIZONTAL_SPACING;
    const startX = -levelWidth / 2;
    nodeIds.forEach((nodeId, index) => {
      horizontalPositions.set(nodeId, startX + index * HORIZONTAL_SPACING);
    });
  });

  return { levels, horizontalPositions };
}

export function DAGProgress({ nodeProgress, dag }: DAGProgressProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Create a mapping of ID to path for easier lookups
  const idToPath = Object.entries(dag).reduce((acc, [path, node]) => {
    acc[node.id] = path;
    return acc;
  }, {} as Record<string, string>);

  // Initialize nodes and edges only once
  useEffect(() => {
    const { levels, horizontalPositions } = calculateNodePositions(dag);

    const initialNodes: Node[] = Object.entries(dag).map(([path, node]) => ({
      id: node.id,
      position: {
        x: horizontalPositions.get(path) || 0,
        y: (levels.get(path) || 0) * 120,
      },
      data: {
        label: createNodeLabel(path, node, nodeProgress[node.id]),
        status: nodeProgress[node.id]?.progress.status || node.status,
        path, // Store the path in the node data
      },
      style: createNodeStyle(
        nodeProgress[node.id]?.progress.status || node.status,
        nodeProgress[node.id]?.progress.percentage
      ),
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }));

    const initialEdges: Edge[] = Object.entries(dag).flatMap(([_, node]) =>
      node.children.map((childPath) => ({
        id: `${node.id}-${dag[childPath].id}`,
        source: node.id,
        target: dag[childPath].id,
        type: "smoothstep",
        animated: nodeProgress[node.id]?.progress.status === "processing",
        style: { stroke: "#666", strokeWidth: 2 },
      }))
    );

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [dag, nodeProgress]);

  // Update only affected nodes when progress changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const progress = nodeProgress[node.id];
        if (!progress) return node;

        const path = idToPath[node.id];
        if (!path || !dag[path]) return node;

        return {
          ...node,
          data: {
            ...node.data,
            label: createNodeLabel(path, dag[path], progress),
            status: progress.progress.status,
          },
          style: createNodeStyle(
            progress.progress.status,
            progress.progress.percentage
          ),
        };
      })
    );

    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        animated: nodeProgress[edge.source]?.progress.status === "processing",
      }))
    );
  }, [nodeProgress, dag, idToPath]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
        minZoom={0.1}
        maxZoom={1.5}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const status = node.data?.status || "pending";
            return getStatusColor(status);
          }}
          maskColor="rgb(0, 0, 0, 0.1)"
          style={{
            backgroundColor: "#f8f8f8",
          }}
        />
      </ReactFlow>
    </div>
  );
}

// Helper functions
function createNodeLabel(
  path: string,
  node: SerializedDAGNode,
  progress?: NodeProgress
) {
  if (!node) return null; // Add safety check
  const displayName = path.split("/").pop() || path;
  return (
    <div className="flex flex-col items-center">
      <div className="font-medium">{displayName}</div>
      {progress?.progress.percentage !== undefined && (
        <div className="text-xs font-semibold">
          {Math.round(progress.progress.percentage)}%
        </div>
      )}
      <div className="text-xs opacity-75">
        {progress?.progress.status || node.status}
      </div>
    </div>
  );
}

function createNodeStyle(status: Status, percentage?: number) {
  return {
    background: getStatusColor(status),
    color: status === "pending" ? "black" : "white",
    border: "1px solid #222",
    borderRadius: "8px",
    padding: "8px",
    width: 180,
    height: percentage !== undefined ? 80 : 60,
  };
}
