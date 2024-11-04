import { ChangelogGenerationStatus } from "@prisma/client";
import { useParams } from "@remix-run/react";
import { useMemo } from "react";
import { useEventSource } from "remix-utils/sse/react";
import { LogProgress } from "~/routes/api.repo.$repoId.logs.progress";

export function useChangelogProgress(logId?: string) {
  const { repoId } = useParams();
  const eventSource = useEventSource(`/api/repo/${repoId}/logs/progress`);

  const progress = useMemo(() => {
    if (!eventSource) return null;
    const data = JSON.parse(eventSource) as LogProgress;
    return logId ? (data.logId === logId ? data : null) : data;
  }, [eventSource, logId]);

  return progress;
}

export function getStatusDisplay(status: ChangelogGenerationStatus) {
  switch (status) {
    case "pending":
      return "Initializing...";
    case "summarizing":
      return "Analyzing changes...";
    case "context":
      return "Building context...";
    case "updating":
      return "Generating changelog...";
    case "completed":
      return "Generation complete";
    case "error":
      return "Generation failed";
    default:
      return "Unknown status";
  }
}
