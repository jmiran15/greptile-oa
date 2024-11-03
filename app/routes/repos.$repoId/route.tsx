import type { Repo } from "@prisma/client";
import { json, LoaderFunction, redirect, SerializeFrom } from "@remix-run/node";
import { Link, Outlet, useLoaderData } from "@remix-run/react";
import {
  ChevronDown,
  LayoutDashboard,
  List,
  MessageCircle,
  Settings,
} from "lucide-react";
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
import { getSession } from "~/utils/session.server";

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

  return json({ user, repos: user.repositories, currentRepo });
};

export default function RepoLayout() {
  const { user, repos, currentRepo } = useLoaderData<typeof loader>();

  return (
    <SidebarProvider>
      <div className="fixed inset-0 flex h-screen overflow-hidden">
        <Sidebar className="flex flex-col flex-shrink-0">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton>
                      {currentRepo.name}
                      <ChevronDown className="ml-auto h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                    {repos.map((repo: SerializeFrom<Repo>) => (
                      <DropdownMenuItem key={repo.id} asChild>
                        <Link prefetch="intent" to={`/repos/${repo.id}`}>
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

          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link prefetch="intent" to={`/repos/${currentRepo.id}/logs`}>
                    <List className="h-4 w-4 mr-2" />
                    Logs
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    prefetch="intent"
                    to={`/repos/${currentRepo.id}/design`}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Design
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link prefetch="intent" to={`/repos/${currentRepo.id}/chat`}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Chat
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link
                    prefetch="intent"
                    to={`/repos/${currentRepo.id}/settings`}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton>
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
  );
}
