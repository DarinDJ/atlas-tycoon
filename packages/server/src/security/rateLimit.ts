/** Token-bucket rate limiter, one bucket per key (socket id, ip, ...). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private readonly ratePerSec: number,
    private readonly burst: number,
  ) {}

  /** Returns true if the call is allowed. */
  take(key: string, cost = 1, now = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.burst, last: now };
      this.buckets.set(key, b);
    }
    const elapsed = (now - b.last) / 1000;
    b.tokens = Math.min(this.burst, b.tokens + elapsed * this.ratePerSec);
    b.last = now;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      return true;
    }
    return false;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Drop idle buckets to bound memory. */
  sweep(now = Date.now(), idleMs = 60_000): void {
    for (const [k, b] of this.buckets) if (now - b.last > idleMs) this.buckets.delete(k);
  }
}
