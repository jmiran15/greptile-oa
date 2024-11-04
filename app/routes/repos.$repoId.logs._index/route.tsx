import { json, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { ExternalLink, Plus } from "lucide-react";
import Container from "~/components/container";
import Description from "~/components/description";
import Title from "~/components/title";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { prisma } from "~/db.server";
import { LogCard } from "./log-card";

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
  const { repoId } = useParams();
  const { logs } = useLoaderData<typeof loader>();

  if (!repoId) {
    return null;
  }

  return (
    <Container className="max-w-5xl">
      <LogsHeader />
      <Separator />
      <div className="space-y-4 overflow-y-auto no-scrollbar flex-1 w-full">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500">No logs found</div>
        ) : (
          logs.map((log) => <LogCard key={log.id} log={log} repoId={repoId} />)
        )}
      </div>
    </Container>
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

export const handle = {
  PATH: (repoId: string) => `/repos/${repoId}/logs`,
};
