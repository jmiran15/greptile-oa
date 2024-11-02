import ReactFlow, {
  Edge,
  MarkerType,
  MiniMap,
  Node,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";

interface RepoNode {
  id: string;
  path: string;
  type: "file" | "folder";
  status: "pending" | "processing" | "completed" | "failed";
  parentId: string | null;
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "rgb(34 197 94)"; // green-500
    case "processing":
      return "rgb(59 130 246)"; // blue-500
    case "failed":
      return "rgb(239 68 68)"; // red-500
    default:
      return "rgb(156 163 175)"; // gray-400
  }
}

function createNodesAndEdges(nodes: RepoNode[]) {
  const flowNodes: Node[] = [];
  const edges: Edge[] = [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const levels = new Map<string, number>();

  // Calculate levels (distance from root)
  function calculateLevel(nodeId: string): number {
    if (levels.has(nodeId)) return levels.get(nodeId)!;

    const node = nodeMap.get(nodeId)!;
    if (!node.parentId) {
      levels.set(nodeId, 0);
      return 0;
    }

    const parentLevel = calculateLevel(node.parentId);
    const level = parentLevel + 1;
    levels.set(nodeId, level);
    return level;
  }

  nodes.forEach((node) => calculateLevel(node.id));

  // Group nodes by level
  const nodesPerLevel = new Map<number, string[]>();
  Array.from(levels.entries()).forEach(([nodeId, level]) => {
    if (!nodesPerLevel.has(level)) {
      nodesPerLevel.set(level, []);
    }
    nodesPerLevel.get(level)!.push(nodeId);
  });

  // Improved spacing constants
  const VERTICAL_SPACING = 150; // Increased from 100
  const HORIZONTAL_SPACING = 250; // Increased from 200
  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 40;

  // Create nodes with improved positions
  nodes.forEach((node) => {
    const level = levels.get(node.id)!;
    const nodesInLevel = nodesPerLevel.get(level)!;
    const horizontalIndex = nodesInLevel.indexOf(node.id);
    const horizontalOffset =
      ((nodesInLevel.length - 1) * HORIZONTAL_SPACING) / 2;

    const displayName = node.path.split("/").pop()!;

    flowNodes.push({
      id: node.id,
      position: {
        x: horizontalIndex * HORIZONTAL_SPACING - horizontalOffset,
        y: level * VERTICAL_SPACING,
      },
      data: {
        label: (
          <div className="flex flex-col items-center">
            <div className="font-medium">{displayName}</div>
            <div className="text-xs opacity-75">{node.type}</div>
          </div>
        ),
        type: node.type,
        status: node.status,
      },
      style: {
        background: getStatusColor(node.status),
        color: node.status === "pending" ? "black" : "white",
        border: "1px solid #222",
        borderRadius: "8px",
        padding: "8px",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      },
    });

    // Create edge if node has parent with improved styling
    if (node.parentId) {
      edges.push({
        id: `${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        type: "smoothstep",
        animated: node.status === "processing",
        style: { stroke: "#666", strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: "#666",
        },
      });
    }
  });

  return { nodes: flowNodes, edges };
}

interface RepoDagProps {
  nodes: RepoNode[];
}

export function RepoDag({ nodes }: RepoDagProps) {
  const { nodes: initialNodes, edges: initialEdges } =
    createNodesAndEdges(nodes);
  const [flowNodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div style={{ width: "100%", height: "800px" }}>
      {" "}
      {/* Increased height */}
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
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
        <MiniMap
          nodeColor={(node) => getStatusColor(node.data.status)}
          maskColor="rgb(0, 0, 0, 0.1)"
          style={{
            backgroundColor: "#f8f8f8",
          }}
        />
      </ReactFlow>
    </div>
  );
}
