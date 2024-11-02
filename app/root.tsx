import type { LinksFunction } from "@remix-run/node";

import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import stylesheet from "~/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export default function App() {
  return (
    <html lang="en" className="h-full">
      <head>
        <Meta />
        <Links />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>

      <body className="h-full bg-transparent">
        
          <Outlet />
          <ScrollRestoration />
          <Scripts />
        
      </body>
    </html>
  );
}
