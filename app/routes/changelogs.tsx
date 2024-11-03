// TESTING ROUTE for generating changelogs

import { ActionFunctionArgs } from "@remix-run/node";
import { Form, json } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { generateChangelogQueue } from "~/queues/generateChangelog/generateChangelog.server";
// export async function loader() {
//   const changelogs = await prisma.changelog.findMany({
//     orderBy: {
//       createdAt: "desc",
//     },
//   });

//   return json({ changelogs });
// }

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const prPath = String(formData.get("prPath"));
  const repoId = String(formData.get("repoId"));

  if (!prPath || !repoId) {
    throw new Error("No pr path provided");
  }

  const job = await generateChangelogQueue.add("generateChangelog", {
    prPath,
    repoId,
  });

  return json({ job });
  // trigger changelog generator job
}

export default function Changelogs() {
  // const { changelogs } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full max-w-4xl mx-auto container">
      <Form method="post" className="flex items-center gap-2 w-full">
        <Input name="prPath" placeholder="pr path" />
        <Input
          name="repoId"
          placeholder="repo id"
          value={"cm30pm39u0000hbk55amzthee"}
        />
        <Button type="submit">Add</Button>
      </Form>

      {/* {changelogs.map((changelog) => (
        <div key={changelog.id}>{changelog.repoId}</div>
      ))} */}
    </div>
  );
}
