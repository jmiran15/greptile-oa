import { LoaderFunction, redirect } from "@remix-run/node";
import { generateStateToken } from "~/utils/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  const { state, cookie } = await generateStateToken(request);

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.append("client_id", process.env.GITHUB_CLIENT_ID!);
  githubAuthUrl.searchParams.append(
    "redirect_uri",
    "http://localhost:3000/auth/github/callback"
  );
  githubAuthUrl.searchParams.append("state", state);

  return redirect(githubAuthUrl.toString(), {
    headers: {
      "Set-Cookie": cookie,
    },
  });
};
