import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import ChangelogPreview from "./$repoId.logs._index/preview";

type PreviewDevice = "desktop" | "mobile";

import { Monitor, Smartphone } from "lucide-react";

interface DeviceSwitcherProps {
  device: "desktop" | "mobile";
  onChange: (device: "desktop" | "mobile") => void;
  className?: string;
}

export default function RepoDesign() {
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  return (
    <div className="h-[100vh] grid grid-cols-1 md:grid-cols-2 gap-6 p-6 overflow-hidden">
      {/* Left Column - Form */}
      <div className="space-y-4 overflow-y-auto">
        <div className="space-y-2">
          <Label htmlFor="test-input">Test Input</Label>
          <Input id="test-input" placeholder="Enter test value..." />
        </div>
      </div>

      {/* Right Column - Preview */}
      <div className="relative flex items-center justify-center overflow-hidden">
        {/* Device Switcher */}
        <div className="absolute top-0 right-0 z-10 m-4">
          <DeviceSwitcher
            device={device}
            onChange={setDevice}
            className="backdrop-blur-sm bg-background/80"
          />
        </div>

        <div
          className={cn(
            "bg-background border rounded-lg shadow-lg overflow-hidden transition-all duration-300",
            {
              "w-[1200px] h-[800px] scale-[0.7]": device === "desktop",
              "w-[390px] h-[844px] scale-[0.7]": device === "mobile",
            }
          )}
        >
          <div
            className={cn(
              "w-full h-full overflow-y-auto",
              device === "mobile" && "xs"
            )}
          >
            <ChangelogPreview isMobile={device === "mobile"} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeviceSwitcher({
  device,
  onChange,
  className,
}: DeviceSwitcherProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center bg-background border rounded-full p-1 shadow-sm",
        className
      )}
    >
      <button
        onClick={() => onChange("desktop")}
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all",
          "hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          device === "desktop" && "bg-accent shadow-sm"
        )}
        aria-label="Switch to desktop view"
      >
        <Monitor className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange("mobile")}
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-full transition-all",
          "hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          device === "mobile" && "bg-accent shadow-sm"
        )}
        aria-label="Switch to mobile view"
      >
        <Smartphone className="h-4 w-4" />
      </button>
    </div>
  );
}
