import { Link } from "@remix-run/react";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

interface ChangelogHeaderProps {
  logoPath: string;
  logoAlt: string;
  title: string;
  description: string;
  path: string;
  linkText: string;
  headerBg: string;
  isMobile?: boolean;
}

export default function ChangelogHeader({
  logoPath,
  logoAlt,
  title,
  description,
  path,
  linkText,
  headerBg,
  isMobile,
}: ChangelogHeaderProps) {
  const bgStyle = headerBg.includes("gradient")
    ? { background: headerBg }
    : { backgroundColor: headerBg };

  return (
    <div className="w-full" style={bgStyle}>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <header
          className={cn(
            "flex flex-col items-center gap-6 px-4 pt-16 text-center",
            {
              "px-4": isMobile || true,
              "px-4 md:px-8": !isMobile,
            }
          )}
        >
          {logoPath && (
            <img
              src={logoPath}
              alt={logoAlt}
              className="h-16 w-16 rounded-lg object-contain"
            />
          )}

          {/* Title and Description */}
          <div className="space-y-2">
            <h1
              className={cn(
                " font-medium tracking-tight",
                // Adjust title size for mobile
                isMobile ? "text-3xl" : "text-4xl"
              )}
            >
              {title}
            </h1>
            <p
              className={cn(
                "text-muted-foreground font-light",
                // Adjust description size for mobile
                isMobile ? "text-base" : "text-lg"
              )}
            >
              {description}
            </p>
          </div>

          {/* Website Link */}
          <Link
            to={path}
            className={cn(
              "text-primary hover:text-primary/90 transition-colors font-medium",
              // Adjust link size for mobile
              isMobile ? "text-xs" : "text-sm"
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            {linkText} →
          </Link>
        </header>
      </div>
      <Separator className="bg-border/60" />
    </div>
  );
}
