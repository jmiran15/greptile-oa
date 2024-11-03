// {
//     id: "1",
//     title: "Major Performance Improvements",
//     publishDate: "2024-03-20",
//     summary:
//       "We've completely revamped our backend infrastructure, resulting in 50% faster load times.",
//     content:
//       "## What's New\n\n- Upgraded to Next.js 14\n- Implemented edge caching\n- Reduced bundle size by 30%",
//   },

import { Link } from "@remix-run/react";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

type Log = {
  id: string;
  title: string;
  publishDate: string;
  summary: string;
  content: string;
};

interface ChangesProps {
  logs: Log[];
  repoId?: string;
  isMobile?: boolean;
}

export default function Changes({ logs, repoId, isMobile }: ChangesProps) {
  return (
    <div>
      <div className="flex flex-col">
        {logs.map((log, i) => (
          <div key={log.id}>
            <div
              className={cn("relative flex w-full", {
                "flex-col": isMobile || true,
                "flex-col md:flex-row": !isMobile,
              })}
            >
              {/* Date Column */}
              <div className="relative flex">
                <div
                  className={cn("flex pb-4", {
                    "w-full": isMobile || true,
                    "w-full md:w-[200px] md:pb-0": !isMobile,
                  })}
                >
                  <p className="text-muted-foreground w-full text-sm font-light">
                    <time className="sticky top-10" dateTime={log.publishDate}>
                      {new Date(log.publishDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </p>
                </div>

                {/* Timeline - Only show when not mobile */}
                <div
                  className={cn("relative w-full", {
                    hidden: isMobile || true,
                    "hidden md:flex md:w-[150px]": !isMobile,
                  })}
                >
                  <div className="bg-foreground/70 sticky left-0 top-[46px] mt-1.5 h-1.5 w-1.5 rounded-full" />
                  {i !== logs.length - 1 && (
                    <div className="bg-foreground/20 absolute left-0.5 top-1 h-full w-[1.5px]" />
                  )}
                </div>
              </div>

              {/* Content Column */}
              <div className="flex w-full flex-col pb-16">
                {/* Title */}
                <Link
                  to={repoId ? `/${repoId}/logs/${log.id}` : `.`}
                  className="group"
                >
                  <h2 className="text-2xl font-medium pb-3 group-hover:text-primary transition-colors">
                    {log.title}
                  </h2>
                </Link>

                {/* Summary */}
                <p className="text-muted-foreground text-base font-light">
                  {log.summary}
                </p>
              </div>
            </div>

            {/* Separator - Show only on mobile */}
            {i !== logs.length - 1 && (
              <Separator
                className={cn("bg-border/60 mb-16", {
                  block: isMobile || true,
                  "block md:hidden": !isMobile,
                })}
              />
            )}
          </div>
        ))}

        {/* Empty State */}
        {logs.length === 0 && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 pt-10">
            <h1 className="text-2xl font-light">No changelogs yet</h1>
            <p className="text-muted-foreground text-center text-base font-light">
              The latest updates, improvements, and fixes will be posted here.
              Stay tuned!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
