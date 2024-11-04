import DOMPurify from "dompurify";
import { marked } from "marked";
import { memo, useMemo } from "react";

interface MarkdownProps {
  content: string;
  className?: string;
}

// Create a custom renderer for better control and performance
const renderer = new marked.Renderer();

export const Markdown = memo(function Markdown({
  content,
  className = "",
}: MarkdownProps) {
  const sanitizedHtml = useMemo(() => {
    const rawHtml = marked.parse(content, { renderer, async: false });
    if (typeof window === "undefined") return rawHtml;
    return DOMPurify.sanitize(rawHtml);
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-full break-words overflow-hidden ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
});
