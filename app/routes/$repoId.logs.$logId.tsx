import { Separator } from "@radix-ui/react-select";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useParams } from "@remix-run/react";
import { ChevronLeft } from "lucide-react";

// Using same dummy data from before
const DUMMY_LOG = {
  id: "1",
  title: "Major Performance Improvements",
  publishDate: "2024-03-20",
  summary:
    "We've completely revamped our backend infrastructure, resulting in 50% faster load times.",
  content:
    "## What's New\n\n- Upgraded to Next.js 14\n- Implemented edge caching\n- Reduced bundle size by 30%",
};

export async function loader({ params }: LoaderFunctionArgs) {
  // TODO: Replace with real data fetch
  return json({ log: DUMMY_LOG });
}

export default function ChangelogEntry() {
  const { repoId } = useParams();
  const { log } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Back Button */}
        <Link
          to={`/${repoId}/logs`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-8"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Changelog
        </Link>

        {/* Main Content */}
        <article className="space-y-8">
          <header className="space-y-4">
            <time className="text-sm text-muted-foreground">
              {new Date(log.publishDate).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </time>
            <h1 className="text-4xl font-bold tracking-tight">{log.title}</h1>
            <p className="text-xl text-muted-foreground">{log.summary}</p>
          </header>

          <Separator />

          {/* Markdown Content */}
          <div className="prose prose-invert max-w-none">{log.content}</div>
        </article>
      </div>
    </div>
  );
}
