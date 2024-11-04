// customize a changelog page

import {
  UploadHandler,
  json,
  unstable_composeUploadHandlers,
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { motion } from "framer-motion";
import { ExternalLink, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { prisma } from "~/db.server";
import { cn } from "~/lib/utils";
import { uploadImage } from "~/utils/cloudinary.server";
import ChangelogPreview from "../$repoId.logs._index/preview";
import { ThemeForm } from "./theme-form";

type PreviewDevice = "desktop" | "mobile";

interface DeviceSwitcherProps {
  device: "desktop" | "mobile";
  onChange: (device: "desktop" | "mobile") => void;
  className?: string;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { repoId } = params;
  if (!repoId) throw new Error("repoId is required");

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
  });

  if (!repo) throw new Error("Repo not found");

  return json({ repo });
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { repoId } = params;
  if (!repoId) throw new Error("No repoId provided");

  const uploadHandler: UploadHandler = unstable_composeUploadHandlers(
    async ({ name, data }) => {
      if (name !== "originalLogoFile" && name !== "croppedLogoFile") {
        return undefined;
      }

      const uploadedImage = await uploadImage(data);
      return uploadedImage.secure_url;
    },
    unstable_createMemoryUploadHandler()
  );

  const formData = await unstable_parseMultipartFormData(
    request,
    uploadHandler
  );
  const intent = String(formData.get("intent"));

  switch (intent) {
    case "themeUpdate": {
      const updateData = JSON.parse(String(formData.get("update")));
      return json({
        repo: await prisma.repo.update({
          where: { id: repoId },
          data: updateData,
        }),
      });
    }
    case "logoImageUpdate": {
      const originalLogoFilepath = formData.get("originalLogoFile")
        ? String(formData.get("originalLogoFile"))
        : undefined;
      const orig = originalLogoFilepath ? { originalLogoFilepath } : {};
      const croppedLogoFilepath = String(formData.get("croppedLogoFile"));
      const lastCrop = JSON.parse(String(formData.get("lastCrop")));

      if (!croppedLogoFilepath || !lastCrop) {
        throw new Error("Invalid image update");
      }

      return json({
        repo: await prisma.repo.update({
          where: { id: repoId },
          data: {
            croppedLogoFilepath,
            lastCrop,
            ...orig,
          },
        }),
      });
    }
    case "removeLogoImage": {
      return json({
        repo: await prisma.repo.update({
          where: { id: repoId },
          data: {
            originalLogoFilepath: null,
            croppedLogoFilepath: null,
            lastCrop: null,
          },
        }),
      });
    }
    default:
      throw new Error("Invalid intent");
  }
};

export default function RepoDesign() {
  const { repo } = useLoaderData<typeof loader>();
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const fetcher = useFetcher();

  const optimisticRepo = fetcher.formData
    ? {
        ...repo,
        ...(fetcher.formData.get("intent") === "themeUpdate"
          ? JSON.parse(String(fetcher.formData.get("update")))
          : fetcher.formData.get("intent") === "logoImageUpdate"
          ? {
              croppedLogoFilepath: String(
                fetcher.formData.get("optimisticPath")
              ),
            }
          : fetcher.formData.get("intent") === "removeLogoImage"
          ? {
              originalLogoFilepath: null,
              croppedLogoFilepath: null,
              lastCrop: null,
            }
          : {}),
      }
    : repo;

  return (
    <div className="mx-auto px-4 py-8 max-w-5xl h-[100vh] grid grid-cols-1 md:grid-cols-10 gap-6 p-6 overflow-hidden container">
      {/* Left Column - Form */}
      <div className="space-y-4 no-scrollbar overflow-y-auto col-span-3">
        <ThemeForm repo={optimisticRepo} fetcher={fetcher} />
      </div>

      {/* Right Column - Preview */}
      <div className="col-span-7 flex flex-col h-full">
        <div className="bg-gray-50 rounded-xl flex flex-col h-full p-6">
          {/* Preview Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-gray-900">Preview</h2>

            <div className="flex items-center gap-3">
              <DeviceSwitcher
                device={device}
                onChange={setDevice}
                className="bg-white"
              />

              <Button variant="outline" asChild>
                <Link to={`/${repo.id}/logs`} target="_blank" className="gap-2">
                  View public page
                  <ExternalLink className="mr-2 h-4 w-4" />{" "}
                </Link>
              </Button>
            </div>
          </div>

          {/* Preview Content */}
          <div className="flex-1 relative">
            <div
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border rounded-lg shadow-lg overflow-hidden origin-center transition-all duration-300",
                {
                  "w-[1200px] h-[800px] scale-[0.45]": device === "desktop",
                  "w-[390px] h-[844px] scale-[0.55]": device === "mobile",
                }
              )}
            >
              <div
                className={cn(
                  "w-full h-full overflow-y-auto no-scrollbar",
                  device === "mobile" && "xs"
                )}
              >
                <ChangelogPreview
                  isMobile={device === "mobile"}
                  repo={optimisticRepo}
                />
              </div>
            </div>
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
      className={cn("flex items-center rounded-md border shadow-sm", className)}
    >
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange("desktop")}
          className={cn("px-3", device === "desktop" && "bg-gray-100")}
        >
          <Monitor className="h-4 w-4" />
        </Button>
      </motion.div>
      <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange("mobile")}
          className={cn("px-3", device === "mobile" && "bg-gray-100")}
        >
          <Smartphone className="h-4 w-4" />
        </Button>
      </motion.div>
    </div>
  );
}

export const handle = {
  PATH: (repoId: string) => `/repos/${repoId}/design`,
};
