import { User } from "@prisma/client";
import { Authenticator } from "remix-auth";
import { GitHubStrategy } from "remix-auth-github";
import { prisma } from "~/db.server";
import { sessionStorage } from "./session.server";

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set");
}

export const authenticator = new Authenticator<User>(sessionStorage);

const githubStrategy = new GitHubStrategy(
  {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectURI: "http://localhost:3000/auth/github/callback",
  },
  async ({ profile }) => {
    console.log("profile: ", JSON.stringify(profile, null, 2));

    const user = await prisma.user.upsert({
      where: { githubId: profile.id },
      update: { username: profile.displayName },
      create: {
        githubId: profile.id,
        username: profile.displayName,
      },
    });

    console.log("successfully authenticated user: ", user);
    return user;
  }
);

authenticator.use(githubStrategy);
