import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "crypto";
import invariant from "tiny-invariant";

invariant(process.env.SESSION_SECRET, "SESSION_SECRET must be set");

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET],
    secure: process.env.NODE_ENV === "production",
  },
});

export const USER_SESSION_KEY = "userId";
export const GITHUB_TOKEN_KEY = "githubToken";
export const GITHUB_STATE_KEY = "githubState";

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

export async function createUserSession({
  request,
  userId,
  accessToken,
  remember,
  redirectTo,
}: {
  request: Request;
  userId: string;
  accessToken: string;
  remember: boolean;
  redirectTo: string;
}) {
  const session = await getSession(request);
  session.set(USER_SESSION_KEY, userId);
  session.set(GITHUB_TOKEN_KEY, accessToken);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await sessionStorage.commitSession(session, {
        maxAge: remember
          ? 60 * 60 * 24 * 7 // 7 days
          : undefined,
      }),
    },
  });
}

export async function generateStateToken(request: Request) {
  const session = await getSession(request);
  const state = crypto.randomUUID();
  session.set(GITHUB_STATE_KEY, state);

  return {
    state,
    cookie: await sessionStorage.commitSession(session),
  };
}

export async function verifyState(request: Request, state: string) {
  const session = await getSession(request);
  const savedState = session.get(GITHUB_STATE_KEY);

  if (!savedState || savedState !== state) {
    throw new Error("Invalid state parameter");
  }

  session.unset(GITHUB_STATE_KEY);
  return sessionStorage.commitSession(session);
}

export async function getGitHubToken(request: Request) {
  const session = await getSession(request);
  return session.get(GITHUB_TOKEN_KEY);
}

export async function logout(request: Request) {
  const session = await getSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
}
