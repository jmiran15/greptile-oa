import type { LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "~/db.server";
import { authenticator } from "~/utils/auth.server";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await authenticator.isAuthenticated(request, {
    failureRedirect: "/login",
  });

  const repositories = await prisma.repository.findMany({
    where: { userId: user.id },
  });

  return json({ user, repositories });
};

export default function Dashboard() {
  const { repositories } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Your Repositories
          </h1>
          <a
            href="https://github.com/apps/greptile-oa/installations/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-black hover:bg-gray-800"
          >
            Add Repositories
          </a>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {repositories.map((repo) => (
              <li key={repo.id}>
                <Link
                  to={`/repo/${repo.id}`}
                  className="block hover:bg-gray-50"
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-indigo-600 truncate">
                        {repo.fullName}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
