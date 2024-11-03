import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  json,
  redirect,
} from "@remix-run/node";
import {
  Form,
  Link,
  useLoaderData,
  useNavigation,
  useParams,
} from "@remix-run/react";
import { ArrowLeft } from "lucide-react";
import { DateTime } from "luxon";
import { useState } from "react";
import { z } from "zod";
import Container from "~/components/container";
import { DatePicker } from "~/components/date-picker";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import { prisma } from "~/db.server";
import { createGitHubClient } from "~/utils/providers.server";
import { getGitHubToken } from "~/utils/session.server";

const CreateLogSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pr"),
    prNumber: z.number({ required_error: "Please select a PR" }),
  }),
  z.object({
    type: z.literal("scratch"),
    title: z.string().min(1, "Title is required"),
    summary: z.string().optional(),
    publishDate: z.string().datetime(),
  }),
]);

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { repoId } = params;
  const token = await getGitHubToken(request);

  if (!token) {
    throw new Error("Unauthorized");
  }

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    select: { fullName: true },
  });

  if (!repo) {
    throw new Error("Repository not found");
  }

  const github = createGitHubClient(token);
  const [owner, repoName] = repo.fullName.split("/");

  const { data: pulls } = await github.rest.pulls.list({
    owner,
    repo: repoName,
    state: "closed",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  // Filter to only include merged PRs
  const mergedPRs = pulls
    .filter((pr) => pr.merged_at !== null)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      mergedAt: pr.merged_at,
      author: pr.user?.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      description: pr.body,
    }));

  return json({ mergedPRs });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { repoId } = params;
  const formData = await request.formData();

  const result = CreateLogSchema.safeParse({
    type: formData.get("type"),
    ...(formData.get("type") === "pr"
      ? {
          prNumber: formData.get("prNumber")
            ? Number(formData.get("prNumber"))
            : undefined,
        }
      : {
          title: formData.get("title"),
          summary: formData.get("summary"),
          publishDate: formData.get("publishDate"),
        }),
  });

  if (!result.success) {
    return json({ errors: result.error.flatten() }, { status: 400 });
  }

  const { type } = result.data;

  // If PR type, fetch PR details
  if (type === "pr") {
    const prNumber = result.data.prNumber;
    const token = await getGitHubToken(request);
    const repo = await prisma.repo.findUnique({
      where: { id: repoId },
      select: { fullName: true },
    });

    if (!repo) throw new Error("Repository not found");

    const github = createGitHubClient(token);
    const [owner, repoName] = repo.fullName.split("/");

    const { data: pr } = await github.rest.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    const log = await prisma.log.create({
      data: {
        repoId: repoId!,
        title: pr.title,
        summary: pr.body || undefined,
        status: "draft",
        prNumber: pr.number,
        prTitle: pr.title,
        prDescription: pr.body || undefined,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
      },
    });

    return redirect(`/repos/${repoId}/logs/${log.id}`);
  } else {
    // Handle scratch creation
    const { title, summary, publishDate } = result.data;

    const log = await prisma.log.create({
      data: {
        repoId: repoId!,
        title,
        summary,
        publishedDate: new Date(publishDate),
        status: "draft",
      },
    });

    return redirect(`/repos/${repoId}/logs/${log.id}`);
  }
};

// create a new log
export default function NewLog() {
  const { mergedPRs } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const { repoId } = useParams();
  const [createType, setCreateType] = useState<"pr" | "scratch">("pr");
  const [selectedPR, setSelectedPR] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [publishDate, setPublishDate] = useState<Date>(new Date());

  const isSubmitting = navigation.state === "submitting";
  const isValid =
    createType === "pr" ? selectedPR !== null : title.trim().length > 0;

  return (
    <Container className="max-w-5xl h-full overflow-y-auto">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" asChild>
              <Link to={`/repos/${repoId}/logs`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to logs
              </Link>
            </Button>
            <Button
              type="submit"
              form="new-log-form"
              disabled={!isValid || isSubmitting}
            >
              Create Draft
            </Button>
          </div>
          <Separator className="mb-8" />
        </div>

        {/* Form Content */}
        <Form
          id="new-log-form"
          method="post"
          className="flex-1 overflow-hidden"
        >
          <div className="space-y-8 h-full overflow-y-auto pb-8">
            <div className="space-y-4">
              <Label>Create From</Label>
              <Select
                name="type"
                value={createType}
                onValueChange={(value: "pr" | "scratch") =>
                  setCreateType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pr">Pull Request</SelectItem>
                  <SelectItem value="scratch">Scratch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {createType === "pr" ? (
              <div className="space-y-4">
                <Label>Select a merged pull request</Label>
                <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-4">
                  {mergedPRs.map((pr) => (
                    <label
                      key={pr.number}
                      className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        name="prNumber"
                        value={pr.number}
                        checked={selectedPR === pr.number}
                        onCheckedChange={() => setSelectedPR(pr.number)}
                      />
                      <div className="space-y-1">
                        <p className="font-medium">{pr.title}</p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>#{pr.number}</span>
                          <span>by {pr.author}</span>
                          <span>
                            {pr.baseBranch} → {pr.headBranch}
                          </span>
                          <span>
                            Merged {DateTime.fromISO(pr.mergedAt!).toRelative()}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  <Label htmlFor="publishDate">Publish Date</Label>
                  <DatePicker
                    id="publishDate"
                    name="publishDate"
                    date={publishDate}
                    setDate={setPublishDate}
                    maxDate={new Date()}
                  />
                </div>

                <div className="space-y-4">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter a title for your log"
                  />
                </div>

                <div className="space-y-4">
                  <Label htmlFor="summary">Summary (Optional)</Label>
                  <Textarea
                    id="summary"
                    name="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="Enter a summary of the changes"
                    rows={4}
                  />
                </div>
              </div>
            )}
          </div>
        </Form>
      </div>
    </Container>
  );
}
