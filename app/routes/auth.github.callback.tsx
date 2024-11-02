import { redirect, type LoaderFunction } from "@remix-run/node";
import { prisma } from "~/db.server";
import { authenticator } from "~/utils/auth.server";

export const loader: LoaderFunction = async ({ request }) => {
  const user = await authenticator.authenticate("github", request, {
    successRedirect: "/dashboard",
    failureRedirect: "/login",
  });

  // Check if user has installed the GitHub app
  const hasInstalledApp = await prisma.repository.findFirst({
    where: { userId: user.id },
  });

  if (!hasInstalledApp) {
    return redirect("/install");
  }

  return redirect("/dashboard");
};
