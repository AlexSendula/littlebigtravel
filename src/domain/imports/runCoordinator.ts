export function createImportRunCoordinator(run: () => Promise<void>) {
  let inFlight: Promise<void> | null = null;
  let queued = false;

  async function drain() {
    do {
      queued = false;
      await run();
    } while (queued);
  }

  return {
    trigger() {
      if (inFlight) {
        queued = true;
        return inFlight;
      }
      inFlight = drain().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    isRunning() {
      return Boolean(inFlight);
    },
  };
}

