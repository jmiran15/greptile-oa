import * as React from "react";
import { cn } from "~/lib/utils";
import { Textarea, TextareaProps } from "./textarea";

const MEASURE_DOM_ID = "__measure";
const SINGLE_LINE_DOM_ID = "__single_measure";
const MAX_ROWS = 20; // Adjust this value as needed

function getDomContentWidth(dom: HTMLElement) {
  const style = window.getComputedStyle(dom);
  const paddingWidth =
    parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return dom.clientWidth - paddingWidth;
}

function getOrCreateMeasureDom(id: string, init?: (dom: HTMLElement) => void) {
  let dom = document.getElementById(id);

  if (!dom) {
    dom = document.createElement("span");
    dom.style.position = "absolute";
    dom.style.wordBreak = "break-word";
    dom.style.fontSize = "14px";
    dom.style.transform = "translateY(-200vh)";
    dom.style.pointerEvents = "none";
    dom.style.opacity = "0";
    dom.id = id;
    document.body.appendChild(dom);
    init?.(dom);
  }

  return dom;
}

function calculateRows(textAreaElement: HTMLTextAreaElement): number {
  const measureDom = getOrCreateMeasureDom(MEASURE_DOM_ID);
  const singleLineDom = getOrCreateMeasureDom(SINGLE_LINE_DOM_ID, (dom) => {
    dom.innerText = "TEXT_FOR_MEASURE";
  });

  const width = getDomContentWidth(textAreaElement);
  measureDom.style.width = `${width}px`;
  measureDom.innerText = textAreaElement.value || "1";
  measureDom.style.fontSize = window.getComputedStyle(textAreaElement).fontSize;

  const endWithEmptyLine = textAreaElement.value.endsWith("\n");
  const height = parseFloat(window.getComputedStyle(measureDom).height);
  const singleLineHeight = parseFloat(
    window.getComputedStyle(singleLineDom).height
  );

  const rows = Math.min(
    Math.round(height / singleLineHeight) + (endWithEmptyLine ? 1 : 0),
    MAX_ROWS
  );

  return rows;
}

interface AutoGrowTextareaProps extends Omit<TextareaProps, "rows"> {
  error?: string;
}

export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoGrowTextareaProps
>(({ className, value, onChange, error, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [rows, setRows] = React.useState(1);

  const updateRows = React.useCallback(() => {
    if (textareaRef.current) {
      const newRows = calculateRows(textareaRef.current);
      setRows(newRows);
    }
  }, []);

  // Update rows when value changes
  React.useEffect(() => {
    updateRows();
  }, [value, updateRows]);

  // Update rows on window resize
  React.useEffect(() => {
    const handleResize = () => {
      updateRows();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateRows]);

  // Initial calculation after mount
  React.useEffect(() => {
    updateRows();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    updateRows();
  };

  return (
    <Textarea
      ref={(element) => {
        // Handle both the forwarded ref and our internal ref
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
        textareaRef.current = element;
      }}
      className={cn(
        "transition-height duration-200",
        error && "border-destructive",
        className
      )}
      value={value}
      onChange={handleChange}
      rows={rows}
      {...props}
    />
  );
});

AutoGrowTextarea.displayName = "AutoGrowTextarea";
