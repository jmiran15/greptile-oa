import { LoaderFunction, redirect } from "@remix-run/node";
import { getSession } from "~/utils/session.server";

export const loader: LoaderFunction = async ({ request }) => {
  const session = await getSession(request);
  const userId = session.get("userId");

  if (userId) {
    return redirect("/repos");
  }

  return redirect("/login");
};

export default function Index() {
  return null;
}
