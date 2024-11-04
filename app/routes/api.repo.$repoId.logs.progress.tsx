import { ChangelogGenerationStatus } from "@prisma/client";
import { json, LoaderFunctionArgs } from "@remix-run/node";
import { QueueEventsListener } from "bullmq";
import { eventStream } from "remix-utils/sse/server";
import { generateChangelogQueue } from "~/queues/changelog/generateChangelog.server";
import { RegisteredQueue } from "~/utils/queue.server";
import { belongsToRepo } from "./api.repo.$repoId.progress";

const events = ["failed", "active", "added", "completed", "progress"];

export type LogProgress = {
  logId: string;
  event: string;
  completed: boolean;
  progress: {
    status: ChangelogGenerationStatus;
  };
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { repoId } = params;

  console.log("repoId", repoId);

  if (!repoId) {
    return json({ error: "Repo ID not provided" }, { status: 400 });
  }

  if (
    !global.__registeredQueues ||
    !global.__registeredQueues[generateChangelogQueue.name]
  ) {
    return json({ error: "Queues are not registered" }, { status: 500 });
  }

  try {
    return eventStream(
      request.signal,
      function setup(send: (event: { event?: string; data: string }) => void) {
        const queues = [generateChangelogQueue];

        console.log("queues", queues);

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
                send({
                  data: JSON.stringify({
                    logId: job.data.logId,
                    event,
                    completed: isCompleted,
                    progress: job.progress,
                  } as LogProgress),
                });
              }
            } catch (error) {
              console.error(`Error sending event: ${event}`, error);
            }
          };
        }

        queues.forEach((queue) => {
          const registeredQueue = global.__registeredQueues?.[queue.name];
          if (!registeredQueue) {
            console.error(`Registered queue not found for ${queue.name}`);
            return;
          }
          events.forEach(async (event) => {
            const listener = await createListener(event, registeredQueue);
            listeners[`${queue.name}-${event}`] = listener;
            registeredQueue?.queueEvents.on(
              event as keyof QueueEventsListener,
              listener
            );
          });
        });

        // remove listeners
        return function clear() {
          queues.forEach((queue) => {
            const registeredQueue = global.__registeredQueues?.[queue.name];
            if (!registeredQueue) {
              console.error(`Registered queue not found for ${queue.name}`);
              return;
            }
            events.forEach((event) => {
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
