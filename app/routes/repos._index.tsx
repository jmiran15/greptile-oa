import { json, LoaderFunction, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { prisma } from "~/db.server";
import { getSession } from "~/utils/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  const userId = session.get("userId");

  if (!userId) {
    return redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      repositories: true,
    },
  });

  if (!user) {
    return redirect("/login");
  }

  // If no repos, redirect to select-repos
  if (user.repositories.length === 0) {
    return redirect("/select-repos");
  }

  return json({
    user,
    repos: user.repositories,
  });
};

export default function Repos() {
  const { user, repos } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center justify-start min-h-screen w-full max-w-7xl mx-auto container py-8">
      <div className="w-full flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <img
            src={user.avatarUrl}
            alt={user.displayName}
            className="w-10 h-10 rounded-full"
          />
          <span className="font-medium text-lg">{user.displayName}</span>
        </div>
        <Form action="/logout" method="post">
          <Button type="submit" variant="outline">
            Logout
          </Button>
        </Form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
        {repos.map((repo) => (
          <Link
            key={repo.id}
            to={`/repos/${repo.id}`}
            className="rounded-lg border bg-card text-card-foreground shadow-sm p-6"
          >
            <h3 className="text-lg font-semibold">{repo.name}</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {repo.description || "No description"}
            </p>
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
              <span>⭐ {repo.stargazersCount}</span>
              <span>🔀 {repo.defaultBranch}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
