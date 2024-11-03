// TESTING ROUTE

// ingest a repo - and show list of repos

import { ActionFunctionArgs } from "@remix-run/node";
import { Form, json, useLoaderData } from "@remix-run/react";
import { RepoDag } from "~/components/repo-dag";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { prisma } from "~/db.server";
import { pruningQueue } from "~/queues/pruning.server";

export async function loader() {
  const repos = await prisma.repo.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      nodes: {
        select: {
          id: true,
          path: true,
          type: true,
          status: true,
          parentId: true,
        },
      },
    },
  });

  return json({ repos });
}

export async function action({ request }: ActionFunctionArgs) {
  // someone submitted a repo url to ingest
  // something like this
  // await initiateIngestion(url);
  const formData = await request.formData();
  const url = String(formData.get("url"));

  if (!url) {
    throw new Error("No url provided");
  }

  return json({
    job: await pruningQueue.add(url, {
      repoUrl: url,
    }),
  });
}

export default function Ingest() {
  const { repos } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-6xl mx-auto container py-8">
      <Form method="post" className="flex items-center gap-2 w-full mb-8">
        <Input name="url" placeholder="Enter repo path" />
        <Button type="submit">Add</Button>
      </Form>

      {repos.length === 0 ? (
        <div>No repos</div>
      ) : (
        <div className="flex flex-col gap-8 w-full">
          {repos.map((repo) => (
            <div key={repo.id} className="border rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">{repo.repoUrl}</h2>
              {repo.nodes.length > 0 ? (
                <RepoDag nodes={repo.nodes} />
              ) : (
                <p className="text-gray-500">
                  Processing repository structure...
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
