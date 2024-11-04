import type { Repo } from "@prisma/client";
import {
  ActionFunctionArgs,
  json,
  LoaderFunction,
  redirect,
  SerializeFrom,
} from "@remix-run/node";
import {
  Link,
  Outlet,
  useFetcher,
  useLoaderData,
  useMatches,
} from "@remix-run/react";
import {
  ChevronDown,
  LayoutDashboard,
  List,
  MessageCircle,
} from "lucide-react";
import { IngestionProgressModal } from "~/components/ingestion-progress-modal";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "~/components/ui/sidebar";
import { Toaster } from "~/components/ui/toaster";
import { prisma } from "~/db.server";
import { initializeIngestionFlow } from "~/flows/initializeIngestion.server";
import { createDAGQueue } from "~/queues/ingestion/createDAG.server";
import { fileIngestQueue } from "~/queues/ingestion/ingestFile.server";
import { folderIngestQueue } from "~/queues/ingestion/ingestFolder.server";
import { pruningQueue } from "~/queues/ingestion/prune.server";
import { triggerLeafsQueue } from "~/queues/ingestion/triggerLeafs.server";
import { SerializedDAGNode } from "~/utils/dag.server";
import { getGitHubToken, getSession } from "~/utils/session.server";

async function findActiveIngestionJobs(repoId: string) {
  const queues = [
    pruningQueue,
    createDAGQueue,
    triggerLeafsQueue,
    fileIngestQueue,
    folderIngestQueue,
  ];

  for (const queue of queues) {
    const activeJobs = await queue.getJobs(["active"], 0, -1);
    const hasActiveJob = activeJobs.some((job) => job.data.repoId === repoId);
    if (hasActiveJob) return true;
  }

  return false;
}

export const loader: LoaderFunction = async ({ request, params }) => {
  const session = await getSession(request);
  const userId = session.get("userId");

  if (!userId) {
    throw new Error("Not authenticated");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      repositories: true,
    },
  });

  if (!user) {
    return redirect("/");
  }

  const currentRepo = await prisma.repo.findUnique({
    where: { id: params.repoId },
  });

  if (!currentRepo) {
    return redirect("/select-repos");
  }

  const hasActiveIngestion = await findActiveIngestionJobs(currentRepo.id);

  if (!currentRepo.ingested && !hasActiveIngestion) {
    return json({
      user,
      repos: user.repositories,
      currentRepo,
      hasActiveIngestion: false,
    });
  }

  const nodes = await prisma.repoNode.findMany({
    where: { repoId: currentRepo.id },
    select: {
      id: true,
      path: true,
      type: true,
      status: true,
      parentId: true,
      url: true,
      sha: true,
      children: {
        select: {
          path: true,
        },
      },
    },
  });

  // Convert to DAG format directly from the database structure
  const dag: Record<string, SerializedDAGNode> = nodes.reduce((acc, node) => {
    acc[node.path] = {
      ...node,
      children: node.children.map((child) => child.path),
      parent: undefined, // Will be set in the next pass
      url: node.url,
      sha: node.sha,
    };
    return acc;
  }, {} as Record<string, SerializedDAGNode>);

  // Set parent relationships
  nodes.forEach((node) => {
    if (node.parentId) {
      const parent = nodes.find((n) => n.id === node.parentId);
      if (parent) {
        dag[node.path].parent = parent.path;
      }
    }
  });

  return json({
    user,
    repos: user.repositories,
    currentRepo,
    hasActiveIngestion,
    dag,
  });
};

export async function action({ request, params }: ActionFunctionArgs) {
  const token = await getGitHubToken(request);
  if (!token) {
    throw new Error("GitHub access token is required");
  }

  console.log("params", params);
  const { repoId } = params;
  if (!repoId) {
    throw new Error("Repo ID is required");
  }

  console.log("repoId", repoId);

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "triggerIngestion") {
    const flowTreeId = await initializeIngestionFlow!({
      repoId,
      githubAccessToken: token,
    });

    return json({ success: true, flowTreeId });
  } else if (intent === "skipIngestion") {
    const repo = await prisma.repo.update({
      where: { id: repoId },
      data: { ingested: true, finishedInitialization: true },
    });
    return json({ success: true, repo });
  }

  return json({ success: false });
}

export function isActive({
  matches,
  path,
  repoId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matches: any;
  path: string;
  repoId: string;
}) {
  if (!repoId) {
    return false;
  }

  return (
    matches
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (match: any) => match.handle && match.handle.PATH
      )
      .filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (match: any) => match.handle.PATH(repoId) === path
      ).length > 0
  );
}

export default function RepoLayout() {
  const { user, repos, currentRepo, hasActiveIngestion, dag } =
    useLoaderData<typeof loader>();
  const matches = useMatches();

  const fetcher = useFetcher({ key: "initializeIngestion" });

  return (
    <>
      {!currentRepo.ingested && (
        <IngestionProgressModal
          repoId={currentRepo.id}
          hasActiveIngestion={hasActiveIngestion}
          onTriggerIngestion={() => {
            fetcher.submit(
              {
                intent: "triggerIngestion",
              },
              {
                method: "post",
              }
            );
          }}
          skipIngestion={() => {
            fetcher.submit(
              {
                intent: "skipIngestion",
              },
              {
                method: "post",
              }
            );
          }}
          refreshIngestion={() => {
            // revalidate the loader to get dag
            fetcher.load(`/repos/${currentRepo.id}`);
          }}
          finishedInitialization={currentRepo.finishedInitialization}
          dag={dag}
        />
      )}
      <SidebarProvider>
        <div className="fixed inset-0 flex h-screen overflow-hidden">
          <Sidebar className="flex flex-col flex-shrink-0">
            <SidebarHeader className="px-3">
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton className="w-full rounded-md">
                        <span className="px-3 py-2">{currentRepo.name}</span>
                        <ChevronDown className="ml-auto h-4 w-4" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                      {repos.map((repo: SerializeFrom<Repo>) => (
                        <DropdownMenuItem key={repo.id} asChild>
                          <Link prefetch="intent" to={`/repos/${repo.id}/logs`}>
                            {repo.name}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem asChild>
                        <Link prefetch="intent" to="/select-repos">
                          Add Repository
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarHeader>

            <SidebarContent className="px-3">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="w-full rounded-md"
                    isActive={isActive({
                      matches,
                      path: `/repos/${currentRepo.id}/logs`,
                      repoId: currentRepo.id,
                    })}
                  >
                    <Link
                      prefetch="intent"
                      to={`/repos/${currentRepo.id}/logs`}
                      className="px-3 py-2"
                    >
                      <List className="h-4 w-4 mr-2" />
                      <span>Logs</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="w-full rounded-md"
                    isActive={isActive({
                      matches,
                      path: `/repos/${currentRepo.id}/design`,
                      repoId: currentRepo.id,
                    })}
                  >
                    <Link
                      prefetch="intent"
                      to={`/repos/${currentRepo.id}/design`}
                      className="px-3 py-2"
                    >
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      <span>Design</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    className="w-full rounded-md"
                    isActive={isActive({
                      matches,
                      path: `/repos/${currentRepo.id}/chat`,
                      repoId: currentRepo.id,
                    })}
                  >
                    <Link
                      prefetch="intent"
                      to={`/repos/${currentRepo.id}/chat`}
                      className="px-3 py-2"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      <span>Chat</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="px-3">
              <SidebarMenu>
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton className="w-full rounded-md">
                        <img
                          src={user.avatarUrl}
                          alt={user.displayName}
                          className="h-6 w-6 rounded-full mr-2"
                        />
                        {user.displayName}
                        <ChevronDown className="ml-auto h-4 w-4" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="top"
                      className="w-[--radix-dropdown-menu-trigger-width]"
                    >
                      <DropdownMenuItem asChild>
                        <form action="/logout" method="post">
                          <Button
                            type="submit"
                            variant="ghost"
                            className="w-full justify-start"
                          >
                            Logout
                          </Button>
                        </form>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>

          <main className="flex-1 relative h-full overflow-hidden">
            <Toaster />
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </>
  );
}
