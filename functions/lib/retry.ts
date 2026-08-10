export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  retries = 1,
  delayMs = 500
): Promise<{ result: T; attempts: number }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (err) {
      lastErr = err;
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastErr;
}
