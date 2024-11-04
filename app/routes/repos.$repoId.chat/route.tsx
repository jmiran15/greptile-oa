// chat with repo - for debugging

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { Loader2 } from "lucide-react";
import Container from "~/components/container";
import { Markdown } from "~/components/markdown";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { chat } from "~/utils/openai";

export async function action({ request, params }: LoaderFunctionArgs) {
  const formData = await request.formData();
  const { repoId } = params;

  if (!repoId) {
    throw new Error("Repo ID is required");
  }

  const query = String(formData.get("query"));

  if (!repoId || !query) {
    throw new Error("Repo ID and query are required");
  }

  // call query function - i.e. chat
  const result = await chat({ repoId, query });

  return json({ ok: true, result });
}

export default function Chat() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <Container className="max-w-5xl">
      <Form method="post" className="space-y-8">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="query"
            className="text-sm font-medium text-muted-foreground"
          >
            Ask a question about this repository
          </label>
          <div className="flex gap-2">
            <Input
              id="query"
              name="query"
              placeholder="e.g., How does the `useIsInstalled` hook work?"
              className="flex-1"
            />
            <Button type="submit" disabled={navigation.state === "submitting"}>
              {navigation.state === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Asking...
                </>
              ) : (
                "Ask"
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Response
          </h2>
          <div className="rounded-lg border bg-muted p-4 text-card-foreground min-h-[200px]">
            {navigation.state === "submitting" ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <Markdown
                content={
                  actionData?.result?.choices[0].message.content ||
                  "Ask a question to get started"
                }
                className="prose max-w-none"
              />
            )}
          </div>
        </div>
      </Form>
    </Container>
  );
}

export const handle = {
  PATH: (repoId: string) => `/repos/${repoId}/chat`,
};
