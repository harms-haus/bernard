const DEFAULT_TIMEOUT_MS = (() => {
  const raw = process.env["DEFAULT_TIMEOUT_MS"];
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid DEFAULT_TIMEOUT_MS: "${raw}" must be a non-negative number`);
  }
  return parsed;
})();

function asMs(timeoutMs?: number): number {
  if (timeoutMs === undefined || timeoutMs === null) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  return timeoutMs;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number, label = "operation"): Promise<T> {
  const ms = asMs(timeoutMs);
  if (!ms || ms <= 0) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);

    promise
      .then((value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
  });
}

