import { Status } from "@prisma/client";
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { Job, QueueEventsListener } from "bullmq";
import { eventStream } from "remix-utils/sse/server";
import { createDAGQueue } from "~/queues/ingestion/createDAG.server";
import { fileIngestQueue } from "~/queues/ingestion/ingestFile.server";
import { folderIngestQueue } from "~/queues/ingestion/ingestFolder.server";
import { pruningQueue } from "~/queues/ingestion/prune.server";
import { triggerLeafsQueue } from "~/queues/ingestion/triggerLeafs.server";
import { RegisteredQueue } from "~/utils/queue.server";

const initialEvents = ["failed", "completed", "active", "added"];
const ingestionEvents = ["failed", "active", "added", "completed", "progress"];

export type InitializationProgress = {
  initialization: boolean;
  repoId: string;
  queueName: string; // e.g, pruning
  completed: boolean;
  event: string;
  returnvalue: any | null;
};

// as the initializationProgress come in, show them as a checklist
// e.g., ✅ pruning repo
// creating DAG
// triggering leafs

export type NodeProgress = {
  initialization: boolean;
  repoNodeId: string;
  queueName: string;
  event: string;
  progress: {
    percentage?: number;
    status: Status;
    finishedIngestion?: boolean;
  }; // some status done have percentage
  completed: boolean;
};

// then once all the inialization ones are done (i.e. the trigger leafs is done), show the dag
// and start showing the node progress
// we can have the DAG loaded into state
// update the sate of the repoNodeId as it comes in.

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { repoId } = params;

  if (!repoId) {
    return json({ error: "Repo ID not provided" }, { status: 400 });
  }

  if (
    !global.__registeredQueues ||
    !global.__registeredQueues[pruningQueue.name] ||
    !global.__registeredQueues[createDAGQueue.name] ||
    !global.__registeredQueues[triggerLeafsQueue.name] ||
    !global.__registeredQueues[fileIngestQueue.name] ||
    !global.__registeredQueues[folderIngestQueue.name]
  ) {
    return json({ error: "Queues are not registered" }, { status: 500 });
  }

  try {
    return eventStream(
      request.signal,
      function setup(send: (event: { event?: string; data: string }) => void) {
        const initialQueues = [pruningQueue, createDAGQueue, triggerLeafsQueue];
        const ingestionQueues = [fileIngestQueue, folderIngestQueue];

        const listeners: { [key: string]: (args: any) => Promise<void> } = {};

        async function createListener(
          event: string,
          registeredQueue: RegisteredQueue
        ) {
          return async function listener(args: any) {
            const job = await registeredQueue?.queue.getJob(args.jobId);
            if (!job || !belongsToRepo(job, repoId!)) return;

            const isCompleted =
              event === "completed" || (await job.isCompleted());

            try {
              if (!request.signal.aborted) {
                switch (registeredQueue.queue.name) {
                  case pruningQueue.name:
                  case createDAGQueue.name:
                  case triggerLeafsQueue.name: {
                    // send initialization progress event type

                    send({
                      data: JSON.stringify({
                        initialization: true,
                        repoId,
                        queueName: registeredQueue.queue.name,
                        completed: isCompleted,
                        event,
                        returnvalue: job.returnvalue,
                      } as InitializationProgress),
                    });
                    break;
                  }
                  case fileIngestQueue.name:
                  case folderIngestQueue.name: {
                    // send ingestion progress event type
                    send({
                      data: JSON.stringify({
                        initialization: false,
                        repoNodeId: job.data.nodeId,
                        queueName: registeredQueue.queue.name,
                        event,
                        progress: job.progress as {
                          percentage?: number;
                          status: Status;
                          finishedIngestion?: boolean;
                        },
                        completed: isCompleted,
                      } as NodeProgress),
                    });
                    break;
                  }
                  default: {
                    // should not happen
                    console.error(
                      `Unknown queue: ${registeredQueue.queue.name}`
                    );
                    break;
                  }
                }
              }
            } catch (error) {
              console.error(`Error sending event: ${event}`, error);
            }
          };
        }

        initialQueues.forEach((queue) => {
          const registeredQueue = global.__registeredQueues?.[queue.name];
          if (!registeredQueue) {
            console.error(`Registered queue not found for ${queue.name}`);
            return;
          }
          initialEvents.forEach(async (event) => {
            const listener = await createListener(event, registeredQueue);
            listeners[`${queue.name}-${event}`] = listener;
            registeredQueue?.queueEvents.on(
              event as keyof QueueEventsListener,
              listener
            );
          });
        });

        ingestionQueues.forEach((queue) => {
          const registeredQueue = global.__registeredQueues?.[queue.name];
          if (!registeredQueue) {
            console.error(`Registered queue not found for ${queue.name}`);
            return;
          }
          ingestionEvents.forEach(async (event) => {
            const listener = await createListener(event, registeredQueue);
            listeners[`${queue.name}-${event}`] = listener;
            registeredQueue?.queueEvents.on(
              event as keyof QueueEventsListener,
              listener
            );
          });
        });

        // TODO - can add an initial check for completed jobs - but that info should already be in the db

        // remove listeners
        return function clear() {
          initialQueues.forEach((queue) => {
            const registeredQueue = global.__registeredQueues?.[queue.name];
            if (!registeredQueue) {
              console.error(`Registered queue not found for ${queue.name}`);
              return;
            }
            initialEvents.forEach((event) => {
              registeredQueue?.queueEvents.removeListener(
                event as keyof QueueEventsListener,
                listeners[`${queue.name}-${event}`]
              );
            });
          });
          ingestionQueues.forEach((queue) => {
            const registeredQueue = global.__registeredQueues?.[queue.name];
            if (!registeredQueue) {
              console.error(`Registered queue not found for ${queue.name}`);
              return;
            }
            ingestionEvents.forEach((event) => {
              registeredQueue?.queueEvents.removeListener(
                event as keyof QueueEventsListener,
                listeners[`${queue.name}-${event}`]
              );
            });
          });
        };
      }
    );
  } catch (error) {
    console.error(`Error in eventStream:`, error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};

export function belongsToRepo(job: Job, repoId: string) {
  return job.data.repoId === repoId;
}
