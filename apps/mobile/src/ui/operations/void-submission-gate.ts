export interface VoidSubmissionGate {
  readonly tryStart: () => boolean;
  readonly finish: () => void;
}

export function createVoidSubmissionGate(): VoidSubmissionGate {
  let isRunning = false;

  return Object.freeze({
    tryStart() {
      if (isRunning) return false;
      isRunning = true;
      return true;
    },
    finish() {
      isRunning = false;
    },
  });
}
