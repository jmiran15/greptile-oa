// import type { LoaderFunction } from "@remix-run/node";
// import { json } from "@remix-run/node";
// import { useLoaderData } from "@remix-run/react";
// import { authenticator } from "~/utils/auth.server";

// export const loader: LoaderFunction = async ({ request }) => {
//   const user = await authenticator.isAuthenticated(request, {
//     failureRedirect: "/login",
//   });

//   const installUrl = `https://github.com/apps/greptile-oa/installations/new?state=${user.id}`;

//   return json({ installUrl });
// };

// export default function Install() {
//   const { installUrl } = useLoaderData<typeof loader>();

//   return (
//     <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
//       <div className="sm:mx-auto sm:w-full sm:max-w-md">
//         <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
//           Install GitHub App
//         </h2>
//         <p className="mt-2 text-center text-sm text-gray-600">
//           To continue, please install our GitHub app
//         </p>
//       </div>

//       <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
//         <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
//           <a
//             href={installUrl}
//             className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
//           >
//             Install GitHub App
//           </a>
//         </div>
//       </div>
//     </div>
//   );
// }
