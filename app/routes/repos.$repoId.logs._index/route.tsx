import type { Log } from "@prisma/client";
import { json, LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { Clock, ExternalLink, GitMerge, Loader2, Plus } from "lucide-react";
import { DateTime } from "luxon";
import { LinkCard, LinkCardBody, LinkCardHeader } from "~/components/card";
import Container from "~/components/container";
import Description from "~/components/description";
import Title from "~/components/title";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { prisma } from "~/db.server";
import {
  getStatusDisplay,
  useChangelogProgress,
} from "~/hooks/use-changelog-progress";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { repoId } = params;

  if (!repoId) {
    throw new Response("Repository ID is required", { status: 400 });
  }

  try {
    const logs = await prisma.log.findMany({
      where: {
        repoId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return json({ logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    throw new Response("Error fetching logs", { status: 500 });
  }
};

export default function Logs() {
  const { logs } = useLoaderData<typeof loader>();

  return (
    <Container className="max-w-5xl">
      <LogsHeader />
      <Separator />
      <div className="space-y-4 overflow-y-auto flex-1 w-full">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500">No logs found</div>
        ) : (
          logs.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </div>
    </Container>
  );
}

function LogCard({ log }: { log: SerializeFrom<Log> }) {
  const { repoId } = useParams();
  const progress = useChangelogProgress(log.id);

  const statusVariants = {
    draft: progress?.progress.status
      ? "bg-blue-100 text-blue-800"
      : "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-gray-100 text-gray-800",
  };

  const renderStatus = () => {
    if (progress?.progress.status && progress.progress.status !== "completed") {
      return (
        <Badge
          className={`${statusVariants[log.status]} flex items-center gap-1`}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {getStatusDisplay(progress.progress.status)}
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
                {log.summary}
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

function LogsHeader() {
  const { repoId } = useParams();

  return (
    <div className="flex flex-col sm:flex-row items-start justify-between">
      <div className="flex flex-col">
        <Title>Logs</Title>
        <Description>Add logs to your repository's changelog</Description>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" asChild>
          <Link to={`/repos/${repoId}/logs/new`}>
            <Plus className="mr-2 h-4 w-4" />{" "}
            <span className="text-md">New update</span>
          </Link>
        </Button>
        <Button asChild>
          <Link to={`/${repoId}/logs`} target="_blank" className="gap-2">
            <ExternalLink className="mr-2 h-4 w-4" />{" "}
            <span className="text-md">View changelog</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
