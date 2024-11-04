// view a single log

import { Separator } from "@radix-ui/react-select";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { ChevronLeft } from "lucide-react";
import { Markdown } from "~/components/markdown";
import { prisma } from "~/db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const { repoId, logId } = params;

  if (!repoId || !logId) {
    throw new Response("Repository ID and Log ID are required", {
      status: 400,
    });
  }

  const log = await prisma.log.findFirst({
    where: {
      id: logId,
      repoId,
      status: "published",
    },
  });

  if (!log) {
    throw new Response("Log not found", { status: 404 });
  }

  return json({ log });
}

export default function ChangelogEntry() {
  const { repoId } = useParams();
  const { log } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Link
          to={`/${repoId}/logs`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-8"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Changelog
        </Link>

        <article className="space-y-8">
          <header className="space-y-4">
            <time className="text-sm text-muted-foreground">
              {log.publishedDate &&
                new Date(log.publishedDate).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
            </time>
            <h1 className="text-4xl font-bold tracking-tight">{log.title}</h1>
            <Markdown content={log.summary ?? ""} className="prose" />
          </header>

          <Separator />

          <div className="prose max-w-none">
            <Markdown content={log.content ?? ""} />
          </div>
        </article>
      </div>
    </div>
  );
}
