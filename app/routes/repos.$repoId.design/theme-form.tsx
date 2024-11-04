import { useFetcher } from "@remix-run/react";
import { useState } from "react";
import { GradientPicker } from "~/components/gradient-picker";
import { ImagePicker } from "~/components/image-picker";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export function validateUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return false;
    }

    if (!urlObj.hostname) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

interface ThemeFormProps {
  repo: {
    themeHeaderBg: string;
    originalLogoFilepath: string | null;
    croppedLogoFilepath: string | null;
    lastCrop: any | null;
    themeHeading: string;
    themeDescription: string;
    themeLinkText: string;
    themeLinkPath: string;
  };
  fetcher: ReturnType<typeof useFetcher>;
}

export function ThemeForm({ repo, fetcher }: ThemeFormProps) {
  const [urlError, setUrlError] = useState<string | null>(null);
  const [headingError, setHeadingError] = useState<string | null>(null);

  const handleThemeUpdate = (update: Partial<typeof repo>) => {
    fetcher.submit(
      {
        intent: "themeUpdate",
        update: JSON.stringify(update),
      },
      { method: "POST", encType: "multipart/form-data" }
    );
  };

  return (
    <div className="space-y-6 p-2 no-scrollbar overflow-y-auto">
      <div className="space-y-2 flex flex-col">
        <Label>Header Background</Label>
        <GradientPicker
          background={repo.themeHeaderBg}
          setBackground={(bg) => handleThemeUpdate({ themeHeaderBg: bg })}
        />
      </div>

      <div className="space-y-2">
        <Label>Logo</Label>
        <ImagePicker
          originalLogoFilepath={repo.originalLogoFilepath}
          croppedLogoFilepath={repo.croppedLogoFilepath}
          savedCrop={repo.lastCrop}
          fetcher={fetcher}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="heading">Heading</Label>
        <Input
          id="heading"
          defaultValue={repo.themeHeading}
          onChange={(e) => {
            const value = e.target.value;
            setHeadingError(value.trim() ? null : "Heading is required");
            if (value.trim()) {
              handleThemeUpdate({ themeHeading: value });
            }
          }}
        />
        {headingError && (
          <p className="text-sm text-destructive">{headingError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          defaultValue={repo.themeDescription}
          onChange={(e) =>
            handleThemeUpdate({ themeDescription: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkText">Link Text</Label>
        <Input
          id="linkText"
          defaultValue={repo.themeLinkText}
          onChange={(e) => handleThemeUpdate({ themeLinkText: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkPath">Link URL</Label>
        <Input
          id="linkPath"
          defaultValue={repo.themeLinkPath}
          onChange={(e) => {
            const value = e.target.value;
            const isValid = validateUrl(value);
            setUrlError(isValid ? null : "Please enter a valid URL");
            if (isValid) {
              handleThemeUpdate({ themeLinkPath: value });
            }
          }}
        />
        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
      </div>
    </div>
  );
}
