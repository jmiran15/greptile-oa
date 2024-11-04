import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useEventSource } from "remix-utils/sse/react";
import { DAGProgress } from "~/components/dag-progress";
import { Dialog, DialogContent } from "~/components/ui/dialog";
import {
  InitializationProgress,
  NodeProgress,
} from "~/routes/api.repo.$repoId.progress";
import { SerializedDAGNode } from "~/utils/dag.server";
import { Button } from "./ui/button";

interface IngestionProgressModalProps {
  repoId: string;
  hasActiveIngestion: boolean;
  onTriggerIngestion: () => void;
  skipIngestion: () => void;
  refreshIngestion: () => void;
  finishedInitialization: boolean;
  dag: Record<string, SerializedDAGNode>;
}

export function IngestionProgressModal({
  repoId,
  hasActiveIngestion,
  onTriggerIngestion,
  skipIngestion,
  refreshIngestion,
  finishedInitialization,
  dag,
}: IngestionProgressModalProps) {
  const [initialized, setInitialized] = useState(finishedInitialization);
  const [initProgress, setInitProgress] = useState<
    Record<string, InitializationProgress>
  >({});
  const [nodeProgress, setNodeProgress] = useState<
    Record<string, NodeProgress>
  >({});

  const eventSource = useEventSource(`/api/repo/${repoId}/progress`);

  useEffect(() => {
    if (!eventSource) return;

    const progress = JSON.parse(eventSource);

    if (progress.initialization) {
      setInitProgress((prev) => ({
        ...prev,
        [progress.queueName]: progress,
      }));
      if (progress.queueName === "triggerLeafs" && progress.completed) {
        refreshIngestion();
        setInitialized(true);
      }
    } else {
      setNodeProgress((prev) => ({
        ...prev,
        [progress.repoNodeId]: progress,
      }));
    }
  }, [eventSource]);

  console.log("initalized", initialized);

  // Load progress from localStorage on mount
  //   useEffect(() => {
  //     const storedInit = localStorage.getItem(`ingestion-init-${repoId}`);
  //     const storedNode = localStorage.getItem(`ingestion-node-${repoId}`);

  //     if (storedInit) setInitProgress(JSON.parse(storedInit));
  //     if (storedNode) setNodeProgress(JSON.parse(storedNode));
  //   }, [repoId]);

  // Save progress to localStorage
  //   useEffect(() => {
  //     if (Object.keys(initProgress).length) {
  //       localStorage.setItem(
  //         `ingestion-init-${repoId}`,
  //         JSON.stringify(initProgress)
  //       );
  //     }
  //     if (Object.keys(nodeProgress).length) {
  //       localStorage.setItem(
  //         `ingestion-node-${repoId}`,
  //         JSON.stringify(nodeProgress)
  //       );
  //     }
  //   }, [initProgress, nodeProgress, repoId]);

  const renderInitializationProgress = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Initializing Repository</h3>
      <ul className="space-y-2">
        {["pruningFlow", "createDAG", "triggerLeafs"].map((stage) => {
          const progress = initProgress[stage];
          return (
            <li key={stage} className="flex items-center gap-2">
              {progress?.completed ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : progress?.event === "active" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="h-4 w-4 bg-gray-200 rounded-full" />
              )}
              <span>{getStageLabel(stage)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <Dialog open={true} modal>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-5xl"
      >
        {!hasActiveIngestion ? (
          <div className="text-center space-y-4">
            <h3 className="text-lg font-medium">Repository Not Ingested</h3>
            <p>Click the button below to start ingesting this repository.</p>
            <Button onClick={onTriggerIngestion}>Start Ingestion</Button>
          </div>
        ) : !initialized ? (
          renderInitializationProgress()
        ) : (
          <div className="flex flex-col h-[700px]">
            <div className="flex-1">
              <DAGProgress nodeProgress={nodeProgress} dag={dag} />
            </div>
            <div className="mt-4 flex flex-col items-center gap-2 border-t pt-4">
              <Button onClick={skipIngestion}>Skip Ingestion</Button>
              <p className="text-sm text-muted-foreground text-center">
                The ingestion process might take a while, if you skip it will
                continue trying to ingest in background
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getStageLabel(stage: string) {
  switch (stage) {
    case "pruning":
      return "Pruning the codebase";
    case "createDAG":
      return "Creating DAG";
    case "triggerLeafs":
      return "Triggering leaf ingestion";
    default:
      return stage;
  }
}
