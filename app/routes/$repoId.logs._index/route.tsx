// the public facing changelog page for a repo

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { prisma } from "~/db.server";
import { useIsMobile } from "~/hooks/use-mobile";
import Changes from "./changes";
import ChangelogHeader from "./header";

export async function loader({ params }: LoaderFunctionArgs) {
  const { repoId } = params;

  if (!repoId) {
    throw new Response("Repository ID is required", { status: 400 });
  }

  const repo = await prisma.repo.findUnique({
    where: { id: repoId },
    select: {
      name: true,
      description: true,
      themeHeaderBg: true,
      croppedLogoFilepath: true,
      themeHeading: true,
      themeDescription: true,
      themeLinkText: true,
      themeLinkPath: true,
    },
  });

  if (!repo) {
    throw new Response("Repository not found", { status: 404 });
  }

  const logs = await prisma.log.findMany({
    where: {
      repoId,
      status: "published",
    },
    orderBy: {
      publishedDate: "desc",
    },
  });

  return json({ repo, logs });
}

export default function RepoChangelog() {
  const { repo, logs } = useLoaderData<typeof loader>();
  const { repoId } = useParams();
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background flex flex-col gap-10">
      <ChangelogHeader
        logoPath={repo.croppedLogoFilepath || ""}
        logoAlt={`${repo.name} logo`}
        title={repo.themeHeading || "Changelog"}
        description={repo.themeDescription || "A changelog for your project"}
        path={repo.themeLinkPath || "#"}
        linkText={repo.themeLinkText || "View on GitHub"}
        headerBg={repo.themeHeaderBg || "#e4e4e7"}
        isMobile={isMobile}
      />

      <div className="mx-auto w-full max-w-4xl px-4">
        <Changes logs={logs} repoId={repoId} isMobile={isMobile} />
      </div>
    </div>
  );
}
