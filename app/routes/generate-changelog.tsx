import { ActionFunctionArgs, json } from "@remix-run/node";
import { Form, useActionData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { octokit } from "~/utils/providers.server";

interface ActionData {
  error?: string;
  prData?: any;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const prUrl = formData.get("prUrl") as string;

  if (!prUrl) {
    return json({ error: "PR URL is required" });
  }

  try {
    // Parse GitHub PR URL
    const prUrlPattern = /github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/;
    const match = prUrl.match(prUrlPattern);

    if (!match) {
      return json({ error: "Invalid GitHub PR URL format" });
    }

    const [, owner, repo, pullNumber] = match;

    // Fetch PR data
    const [prDetails, prFiles, prCommits] = await Promise.all([
      octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: parseInt(pullNumber),
      }),
      octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: parseInt(pullNumber),
      }),
      octokit.rest.pulls.listCommits({
        owner,
        repo,
        pull_number: parseInt(pullNumber),
      }),
    ]);

    return json({
      prData: {
        details: prDetails.data,
        files: prFiles.data,
        commits: prCommits.data,
      },
    });
  } catch (error) {
    console.error("Error fetching PR data:", error);
    return json({
      error:
        "Failed to fetch PR data. Please ensure the PR URL is correct and the repository is public.",
    });
  }
}

export default function GenerateChangelog() {
  const actionData = useActionData<ActionData>();

  return (
    <div className="container w-full py-10">
      <h1 className="text-2xl font-bold mb-8">Generate Changelog from PR</h1>

      <Form method="post" className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="prUrl">GitHub PR URL</Label>
          <Input
            id="prUrl"
            name="prUrl"
            type="url"
            placeholder="https://github.com/owner/repo/pull/123"
            required
            className="w-full"
          />
        </div>

        <Button type="submit" className="w-full">
          Generate Changelog
        </Button>
      </Form>

      {actionData?.error && (
        <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-md">
          {actionData.error}
        </div>
      )}

      {actionData?.prData && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">PR Details</h2>
          <pre className="p-4 bg-gray-50 rounded-md overflow-auto">
            {JSON.stringify(actionData.prData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
