import { Link } from "@remix-run/react";
import { ReactNode } from "react";
import { cn } from "~/lib/utils";

export function LinkCard({
  to,
  children,
  ariaLabel,
  className,
}: {
  to: string;
  children: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={cn(
        "block rounded-lg border bg-card text-card-foreground hover:shadow-sm hover:drop-shadow-sm hover:shadow-gray-200 transition-all duration-300 overflow-hidden w-full",
        className
      )}
    >
      {children}
    </Link>
  );
}

export function LinkCardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <div className="text-sm text-muted-foreground line-clamp-2">
        {children}
      </div>
    </div>
  );
}

export function LinkCardHeader({
  title,
  tag,
}: {
  title: string;
  tag: ReactNode | undefined;
}) {
  return (
    <div className="flex justify-between items-start">
      <div className="font-semibold text-base sm:text-lg text-primary truncate w-full">
        {title}
      </div>
      {tag && (
        <div className="flex-shrink-0 ml-2 text-muted-foreground text-sm">
          {tag}
        </div>
      )}
    </div>
  );
}
