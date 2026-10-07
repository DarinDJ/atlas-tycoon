/**
 * Pluggable analytics. Events are fire-and-forget and never block game logic.
 * Adapters: console (dev), noop, http (POST JSON batches to ANALYTICS_ENDPOINT, e.g. PostHog/own collector).
 */
export type AnalyticsEvent =
  | 'room_created'
  | 'room_joined'
  | 'game_started'
  | 'game_finished'
  | 'map_chosen'
  | 'player_returned'
  | 'player_disconnected'
  | 'trade_completed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'share_clicked'
  | 'daily_challenge_completed';

export interface AnalyticsAdapter {
  track(event: AnalyticsEvent, props?: Record<string, unknown>): void;
  flush?(): Promise<void>;
}

export class ConsoleAnalytics implements AnalyticsAdapter {
  track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
    console.log(`[analytics] ${event}`, JSON.stringify(props));
  }
}

export class NoopAnalytics implements AnalyticsAdapter {
  track(): void {}
}

export class HttpAnalytics implements AnalyticsAdapter {
  private queue: { event: string; props: Record<string, unknown>; at: number }[] = [];
  private timer: NodeJS.Timeout | null = null;
  constructor(private endpoint: string) {}
  track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
    this.queue.push({ event, props, at: Date.now() });
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), 5000);
  }
  async flush(): Promise<void> {
    this.timer = null;
    const batch = this.queue.splice(0, 200);
    if (batch.length === 0) return;
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batch }),
      });
    } catch (err) {
      console.warn('[analytics] flush failed', (err as Error).message);
    }
  }
}

export function createAnalytics(kind: string, endpoint: string): AnalyticsAdapter {
  if (kind === 'http' && endpoint) return new HttpAnalytics(endpoint);
  if (kind === 'console') return new ConsoleAnalytics();
  return new NoopAnalytics();
}
