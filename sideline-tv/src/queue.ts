// The list of episodes being watched, so the player can offer "Next episode".
import type { LinkOpts } from './portal';

export type QueueItem = { cmd: string; name: string; opts: LinkOpts };
let items: QueueItem[] = [];
let index = -1;

export function setQueue(list: QueueItem[], at: number) { items = list; index = at; }
export function clearQueue() { items = []; index = -1; }
export function current(): QueueItem | null { return items[index] || null; }
export function hasNext() { return index >= 0 && index < items.length - 1; }
export function next(): QueueItem | null { if (!hasNext()) return null; index++; return items[index]; }
