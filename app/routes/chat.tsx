import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { prisma } from "~/db.server";
import { chat } from "~/utils/openai";

export async function loader() {
  const repos = await prisma.repo.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      repoUrl: true,
    },
  });

  return json({ repos });
}

export async function action({ request }: LoaderFunctionArgs) {
  const formData = await request.formData();
  const repoId = String(formData.get("repoId"));
  const query = String(formData.get("query"));

  console.log("Repo ID:", repoId);
  console.log("Query:", query);

  if (!repoId || !query) {
    throw new Error("Repo ID and query are required");
  }

  // call query function - i.e. chat
  const result = await chat({ repoId, query });

  return json({ ok: true, result });
}

export default function Chat() {
  const { repos } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-6xl mx-auto container py-8">
      <Form method="post" className="flex flex-col gap-4 w-full">
        <div className="flex flex-col gap-2">
          <label htmlFor="repo-select" className="text-sm font-medium">
            Select Repository
          </label>
          <Select name="repoId">
            <SelectTrigger id="repo-select">
              <SelectValue placeholder="Select a repository" />
            </SelectTrigger>
            <SelectContent>
              {repos.map((repo) => (
                <SelectItem key={repo.id} value={repo.id}>
                  {repo.repoUrl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="query" className="text-sm font-medium">
            Your Question
          </label>
          <div className="flex gap-2">
            <Input
              id="query"
              name="query"
              placeholder="Ask something about the repository..."
              className="flex-1"
            />
            <Button type="submit">Ask</Button>
          </div>
        </div>

        <div className="mt-8 w-full">
          <h2 className="text-lg font-semibold mb-4">Response</h2>
          <div className="border rounded-lg p-4 min-h-[100px] bg-muted">
            <p className="text-gray-500">
              {navigation.formData && navigation.formData.get("query")
                ? "loading..."
                : actionData?.result?.choices[0].message.content}
            </p>
          </div>
        </div>
      </Form>
    </div>
  );
}
