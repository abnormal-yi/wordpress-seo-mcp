/**
 * core/event-wiring.ts
 * Wires live EventBus events into EventStore (append) and WebhookDispatcher (dispatch).
 *
 * Before this file existed, EventBus.emit() was called throughout the codebase
 * but nothing ever listened — events vanished into the void.
 * Now every event is:
 *   a) Stored in EventStore (queryable via the `infra-events` tool)
 *   b) Dispatched to any registered webhook endpoints
 */

import type { EventBus } from './event-bus.js';
import type { EventStore } from '../infrastructure/event-store.js';
import type { WebhookDispatcher } from '../infrastructure/webhook-dispatcher.js';

/** All event patterns that should be persisted and/or dispatched */
const ALL_EVENTS = '**';

export function wireEvents(
  bus: EventBus,
  eventStore: EventStore,
  webhooks: WebhookDispatcher,
): void {

  // 1. Append every event to EventStore so `infra-events` tool actually has data
  bus.on(ALL_EVENTS, (event) => {
    eventStore.append(event);
  });

  // 2. Dispatch completed/failed events to registered webhooks
  //    (analysis/apply results are the most useful for external integrations)
  const WEBHOOK_EVENTS = [
    'analysis:complete',
    'analysis:failed',
    'apply:complete',
    'apply:failed',
    'apply:rollback',
    'batch:completed',
    'site:added',
    'site:removed',
    'health:changed',
    'rate-limit:exceeded',
    'circuit:open',
    'circuit:close',
    'security:event',
  ] as const;

  for (const eventType of WEBHOOK_EVENTS) {
    bus.on(eventType, async (event) => {
      try {
        await webhooks.dispatch(eventType, event.payload);
      } catch (err) {
        // Webhook failures must never crash the main flow
        console.error(`[webhooks] Failed to dispatch '${eventType}':`, String(err));
      }
    });
  }

  console.log('[events] EventStore + WebhookDispatcher wired to EventBus');
}
