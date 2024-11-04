import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { ArrowLeft, ExternalLink, GitMerge, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { BlockerDialog } from "~/components/blocker-dialog";
import Container from "~/components/container";
import { DatePicker } from "~/components/date-picker";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { AutoGrowTextarea } from "~/components/ui/auto-grow-textarea";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { prisma } from "~/db.server";
import { useBlocker } from "~/hooks/use-blocker";
import {
  getStatusDisplay,
  useChangelogProgress,
} from "~/hooks/use-changelog-progress";
import { useToast } from "~/hooks/use-toast";

const UpdateLogSchema = z.object({
  title: z.string().min(1, "Title is required"),
  summary: z.string().optional(),
  content: z.string().optional(),
  publishedDate: z.string().datetime(),
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { logId } = params;

  const log = await prisma.log.findUnique({
    where: { id: logId },
    include: {
      repo: {
        select: {
          fullName: true,
        },
      },
    },
  });

  if (!log) {
    throw new Response("Log not found", { status: 404 });
  }

  return json({ log });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { logId, repoId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "update": {
      const result = UpdateLogSchema.safeParse({
        title: formData.get("title"),
        summary: formData.get("summary"),
        content: formData.get("content"),
        publishedDate: formData.get("publishedDate"),
      });

      if (!result.success) {
        return json({ errors: result.error.flatten() }, { status: 400 });
      }

      const log = await prisma.log.update({
        where: { id: logId },
        data: result.data,
      });

      return json({ success: true, log });
    }

    case "publish": {
      const log = await prisma.log.findUnique({ where: { id: logId } });
      if (!log?.content) {
        return json(
          { errors: { content: ["Content is required to publish"] } },
          { status: 400 }
        );
      }

      await prisma.log.update({
        where: { id: logId },
        data: {
          status: "published",
          publishedDate: new Date(),
        },
      });

      return json({ success: true });
    }

    case "unpublish": {
      await prisma.log.update({
        where: { id: logId },
        data: { status: "draft" },
      });

      return json({ success: true });
    }

    case "archive": {
      await prisma.log.update({
        where: { id: logId },
        data: { status: "archived" },
      });

      return redirect(`/repos/${repoId}/logs`);
    }

    default:
      return json({ error: "Invalid intent" }, { status: 400 });
  }
};

export default function EditLog() {
  const { log } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const publishFetcher = useFetcher();
  const archiveFetcher = useFetcher();
  const [isEdited, setIsEdited] = useState(false);
  const [showBlockerDialog, setShowBlockerDialog] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const blocker = useBlocker(isEdited);
  const { toast } = useToast();
  const progress = useChangelogProgress(log.id);

  const isGenerating =
    (progress?.progress.status && progress.progress.status !== "completed") ||
    log.generationStatus !== "completed";
  const hasError =
    progress?.progress.status === "error" || log.generationStatus === "error";

  const renderProgressBadge = () => {
    if (!progress?.progress.status || log.generationStatus === "completed")
      return null;

    return (
      <div className="mb-8 p-4 rounded-lg border bg-muted">
        <div className="flex items-center gap-2">
          {progress.progress.status !== "completed" && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span className="text-sm font-medium">
            {getStatusDisplay(progress.progress.status || log.generationStatus)}
          </span>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowBlockerDialog(true);
    }
  }, [blocker.state]);

  const handleBlockerConfirm = () => {
    setShowBlockerDialog(false);
    blocker.proceed();
  };

  const handleBlockerCancel = () => {
    setShowBlockerDialog(false);
    blocker.reset();
  };

  const [formData, setFormData] = useState({
    title: log.title,
    summary: log.summary || "",
    content: log.content || "",
    publishedDate: log.publishedDate || new Date(),
  });

  // Handle form changes
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setIsEdited(true);
  };

  // Reset form when saving is successful
  useEffect(() => {
    if (actionData?.success) {
      setIsEdited(false);
      toast({
        title: "Changes saved successfully",
        duration: 3000,
      });
    }
  }, [actionData]);

  const isLoading =
    navigation.state === "submitting" ||
    publishFetcher.state === "submitting" ||
    archiveFetcher.state === "submitting";

  return (
    <Container className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link to={`/repos/${log.repoId}/logs`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to logs
            </Link>
          </Button>
          {log.status === "published" && (
            <Button variant="outline" asChild>
              <Link to={`/${log.repoId}/logs/${log.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View log
              </Link>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={isLoading || (isGenerating && !hasError)}
              >
                Archive
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This log will be archived and
                  removed from the list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <archiveFetcher.Form method="post">
                  <input type="hidden" name="intent" value="archive" />
                  <Button
                    variant="destructive"
                    type="submit"
                    disabled={isLoading || (isGenerating && !hasError)}
                  >
                    {isLoading ? "Archiving..." : "Archive"}
                  </Button>
                </archiveFetcher.Form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <publishFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value={log.status === "published" ? "unpublish" : "publish"}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={isLoading || isGenerating || !log.content}
            >
              {isLoading
                ? "Loading..."
                : log.status === "published"
                ? "Unpublish"
                : "Publish"}
            </Button>
          </publishFetcher.Form>

          <Button
            type="submit"
            form="edit-form"
            disabled={!isEdited || isLoading || isGenerating}
          >
            {isLoading ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>

      <Separator />

      {renderProgressBadge()}

      {log.prNumber && (
        <div className="p-4 rounded-lg border bg-muted">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitMerge className="h-4 w-4" />
            <span>Created from PR #{log.prNumber}</span>
            <span>•</span>
            <span>
              {log.baseBranch} → {log.headBranch}
            </span>
          </div>
        </div>
      )}

      <Form
        id="edit-form"
        method="post"
        ref={formRef}
        className="space-y-4"
        onChange={() => setIsEdited(true)}
      >
        <input type="hidden" name="intent" value="update" />

        <div className="space-y-4">
          <Label htmlFor="publishedDate">Publish Date</Label>
          <DatePicker
            id="publishedDate"
            name="publishedDate"
            date={new Date(formData.publishedDate)}
            setDate={(date) => {
              setFormData((prev) => ({ ...prev, publishedDate: date }));
              setIsEdited(true);
            }}
            maxDate={new Date()}
          />
        </div>

        <div className="space-y-4">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            error={actionData?.errors?.title?.[0]}
          />
        </div>

        <div className="space-y-4">
          <Label htmlFor="summary">Summary (Optional)</Label>
          <AutoGrowTextarea
            id="summary"
            name="summary"
            value={formData.summary}
            onChange={handleChange}
          />
        </div>

        <div className="space-y-4">
          <Label htmlFor="content">Content</Label>
          {isGenerating ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <AutoGrowTextarea
              id="content"
              name="content"
              value={formData.content}
              onChange={handleChange}
              error={actionData?.errors?.content?.[0]}
              placeholder="Write your content here..."
              disabled={isGenerating}
            />
          )}
          {actionData?.errors?.content && (
            <p className="text-sm text-destructive">
              {actionData.errors.content[0]}
            </p>
          )}
        </div>
      </Form>

      <BlockerDialog
        isOpen={showBlockerDialog}
        onConfirm={handleBlockerConfirm}
        onCancel={handleBlockerCancel}
      />
    </Container>
  );
}

export const handle = {
  PATH: (repoId: string) => `/repos/${repoId}/logs`,
};
