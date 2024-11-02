import { Form } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export async function loader() {}

export async function action({}) {}

export default function Repos() {
  // list of repos + simple url form at the top

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full max-w-7xl mx-auto container">
      <Form method="post" className="flex items-center gap-2">
        <Input name="url" placeholder="repo path" />
        <Button type="submit">Add</Button>
      </Form>
    </div>
  );
}
