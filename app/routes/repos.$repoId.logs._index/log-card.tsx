import type { Log } from "@prisma/client";
import { SerializeFrom } from "@remix-run/node";
import { Clock, GitMerge, Loader2 } from "lucide-react";
import { DateTime } from "luxon";
import { LinkCard, LinkCardBody, LinkCardHeader } from "~/components/card";
import { Markdown } from "~/components/markdown";
import { Badge } from "~/components/ui/badge";
import {
  getStatusDisplay,
  useChangelogProgress,
} from "~/hooks/use-changelog-progress";

export function LogCard({
  log,
  repoId,
}: {
  log: SerializeFrom<Log>;
  repoId: string;
}) {
  const progress = useChangelogProgress(log.id);

  const statusVariants = {
    draft: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-800",
  };

  const renderStatus = () => {
    if (
      progress?.progress.status &&
      progress.progress.status !== "completed" &&
      log.generationStatus !== "completed"
    ) {
      return (
        <Badge className={`bg-blue-100 text-blue-800 flex items-center gap-1`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          {getStatusDisplay(progress.progress.status || log.generationStatus)}
        </Badge>
      );
    }

    return (
      <Badge className={statusVariants[log.status]}>
        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
      </Badge>
    );
  };

  function getFormattedDate() {
    if (log.status === "published" && log.publishedDate) {
      return `Published ${DateTime.fromJSDate(
        new Date(log.publishedDate)
      ).toRelative()}`;
    }
    return `Last updated ${DateTime.fromJSDate(
      new Date(log.updatedAt)
    ).toRelative()}`;
  }

  return (
    <LinkCard to={`/repos/${repoId}/logs/${log.id}`} className="mb-4">
      <div className="p-4 flex flex-col gap-1">
        <LinkCardHeader title={log.title} tag={renderStatus()} />
        <LinkCardBody>
          {log.summary && (
            <div className="relative">
              <div className="text-sm text-muted-foreground line-clamp-2 mb-4">
                <Markdown content={log.summary} className="prose-xs" />
              </div>
              <div className="absolute bottom-0 right-0 w-1/4 h-full bg-gradient-to-l from-white to-transparent" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {log.prNumber && (
              <div className="flex items-center gap-1">
                <GitMerge className="w-4 h-4" />
                <span>
                  PR #{log.prNumber}: {log.baseBranch} → {log.headBranch}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{getFormattedDate()}</span>
            </div>
          </div>
        </LinkCardBody>
      </div>
    </LinkCard>
  );
}
