import { LoaderFunction, redirect } from "@remix-run/node";
import { prisma } from "~/db.server";
import { createGitHubClient } from "~/utils/providers.server";
import { createUserSession, verifyState } from "~/utils/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return redirect("/login");
  }

  // Verify state parameter
  const newCookie = await verifyState(request, state);

  // Exchange code for access token
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    }
  );

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return redirect("/login");
  }

  // Get user info from GitHub
  const octokit = createGitHubClient(tokenData.access_token);
  const { data: githubUser } = await octokit.rest.users.getAuthenticated();

  // Create or update user in database (without tokens)
  const user = await prisma.user.upsert({
    where: { githubId: githubUser.id.toString() },
    create: {
      githubId: githubUser.id.toString(),
      username: githubUser.login,
      displayName: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
    },
    update: {
      username: githubUser.login,
      displayName: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
    },
  });

  // Create user session with access token and redirect
  return createUserSession({
    request,
    userId: user.id,
    accessToken: tokenData.access_token,
    remember: true,
    redirectTo: "/repos",
  });
};
