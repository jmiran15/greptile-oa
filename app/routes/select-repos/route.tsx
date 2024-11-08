import {
  ActionFunction,
  json,
  LoaderFunction,
  redirect,
} from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import Container from "~/components/container";
import Description from "~/components/description";
import Title from "~/components/title";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { prisma } from "~/db.server";
import { createGitHubClient } from "~/utils/providers.server";
import { getGitHubToken, getSession } from "~/utils/session.server";

interface LoaderData {
  availableRepos: Array<{
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    stargazers_count: number;
    default_branch: string;
  }>;
}

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  const userId = session.get("userId");
  const token = await getGitHubToken(request);

  if (!token || !userId) {
    return redirect("/login");
  }

  const github = createGitHubClient(token);

  // Get all repositories the user has access to
  const { data: repos } = await github.rest.repos.listForAuthenticatedUser({
    sort: "updated",
    per_page: 100,
    visibility: "public",
  });

  return json<LoaderData>({ availableRepos: repos });
};

export const action: ActionFunction = async ({ request }) => {
  const session = await getSession(request);
  const userId = session.get("userId");
  const token = await getGitHubToken(request);

  if (!token || !userId) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const selectedRepos = formData.getAll("repos");

  const github = createGitHubClient(token);

  // Get detailed info for each selected repo
  const repoPromises = selectedRepos.map(async (repoFullName) => {
    const [owner, repo] = repoFullName.toString().split("/");
    const { data } = await github.rest.repos.get({ owner, repo });

    console.log(JSON.stringify(data, null, 2));

    return {
      name: data.name,
      owner: data.owner.login,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      stargazersCount: data.stargazers_count,
      userId,
    };
  });

  const repoData = await Promise.all(repoPromises);

  // Upsert all selected repos
  await Promise.all(
    repoData.map((repo) =>
      prisma.repo.upsert({
        where: {
          userId_fullName: {
            userId,
            fullName: repo.fullName,
          },
        },
        create: repo,
        update: repo,
      })
    )
  );

  return redirect("/repos");
};

export default function SelectRepos() {
  const { availableRepos } = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [disabled, setDisabled] = useState(true);

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Container className="max-w-5xl">
        <div className="flex flex-col sm:flex-row items-start justify-between mb-6">
          <div className="flex flex-col">
            <Title>Select Repositories</Title>
            <Description>Choose repositories to track changes</Description>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Form
              method="post"
              onChange={(e) => {
                const form = e.currentTarget;
                const hasSelected =
                  form.querySelectorAll('input[name="repos"]:checked').length >
                  0;
                setDisabled(!hasSelected);
              }}
              className="space-y-4"
            >
              <div className="max-h-[60vh] overflow-y-auto no-scrollbar relative h-full">
                <div className="relative w-full space-y-4">
                  {availableRepos.map((repo) => (
                    <label
                      key={repo.id}
                      className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent cursor-pointer"
                    >
                      <Checkbox name="repos" value={repo.full_name} />
                      <div className="space-y-1">
                        <p className="font-medium">{repo.full_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {repo.description || "No description"}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>⭐ {repo.stargazers_count}</span>
                          <span>🔀 {repo.default_branch}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || disabled}
              >
                {isSubmitting
                  ? "Adding repositories..."
                  : "Add selected repositories"}
              </Button>
            </Form>
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
