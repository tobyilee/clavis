import { notifyOnEvent } from '../services/notifications';
import { indexOnEvent } from '../services/semantic';
import { deliverOnEvent } from '../services/webhooks';
import type { EventHandler } from './index';

/** What the queue consumer runs for every event, in order. */
export const EVENT_HANDLERS: readonly EventHandler[] = [
  notifyOnEvent,
  deliverOnEvent,
  indexOnEvent,
];
