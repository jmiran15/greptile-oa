// // given a node
// // get its downstream summary
// // if it has children, notify them to update their downstreamSummary

// import { prisma } from "~/db.server";
// import { Queue } from "~/utils/queue.server";

// export const downstreamSummaryQueue = Queue<{ nodeId: string }>(
//   "downstreamSummary",
//   async (job) => {
//     // lets get the node
//     const node = await prisma.repoNode.findUnique({
//       where: {
//         id: job.data.nodeId,
//       },
//       include: {
//         parent: true,
//         children: true,
//       },
//     });

//     if (!node) {
//       return;
//     }

//     // if it has no parent, set its upstreamsummary to its downstreamsummary
//     // and call on the children to update their downstreamSummary
//     if (!node.parent) {
//       await prisma.repoNode.update({
//         where: { id: node.id },
//         data: {
//           downstreamSummary: node.upstreamSummary,
//         },
//       });

//       // notify its children to update their downstreamSummary
//       return await downstreamSummaryQueue.addBulk(
//         node.children.map((child: any) => ({
//           name: `downstreamSummary-${child.id}`,
//           data: { nodeId: child.id },
//         }))
//       );
//     }

//     // TODO;  implement
//     return;

//     // generate the downstream summary
//     // just basing off the parent's downstream summary for now - could include all the parents downstream summaries
//     // same goes for the upstream summary
//   }
// );
