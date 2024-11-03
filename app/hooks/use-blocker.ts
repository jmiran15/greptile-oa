import {
  useBeforeUnload,
  useBlocker as useRemixBlocker,
} from "@remix-run/react";
import { useCallback } from "react";

export function useBlocker(shouldBlock: boolean) {
  // Use Remix's built-in blocker
  const blocker = useRemixBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        // Don't block if there are no unsaved changes
        if (!shouldBlock) return false;

        // Don't block if navigating to the same location
        return currentLocation.pathname !== nextLocation.pathname;
      },
      [shouldBlock]
    )
  );

  // Also block browser's native beforeunload event
  useBeforeUnload(
    useCallback(
      (event) => {
        if (shouldBlock) {
          event.preventDefault();
          return "You have unsaved changes. Are you sure you want to leave?";
        }
      },
      [shouldBlock]
    )
  );

  return blocker;
}
