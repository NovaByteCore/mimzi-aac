import type { MyDay, Observation, ScheduleItem, Tile } from '../types';

/** Every photo / recording / sign id still in use. Anything else can be deleted from the device. */
export function referencedMediaIds(state: { tiles: Tile[]; myDay: MyDay; observations: Observation[] }): Set<string> {
  const ids = new Set<string>();
  const add = (id?: string) => id && ids.add(id);
  for (const t of state.tiles) {
    add(t.photoId);
    add(t.audioId);
    add(t.signId);
  }
  const items: ScheduleItem[] = [
    state.myDay.firstThen.first,
    state.myDay.firstThen.then,
    state.myDay.reward.item,
    ...state.myDay.routine.steps,
    ...state.myDay.firstThenTemplates.flatMap((t) => [t.first, t.then]),
    ...state.myDay.rewardTemplates.map((t) => t.item),
    ...state.myDay.routineTemplates.flatMap((t) => t.steps),
  ];
  for (const i of items) add(i.photoId);
  for (const o of state.observations) add(o.audioId);
  return ids;
}

/** Media types a caregiver can attach as a sign demonstration. */
export const SIGN_ACCEPT = 'image/gif,video/mp4,video/webm,video/quicktime';
export const MAX_SIGN_BYTES = 30 * 1024 * 1024;

export function isSignFile(type: string): boolean {
  return type === 'image/gif' || type.startsWith('video/');
}

/** The best format this browser can record audio in (Safari: mp4/aac, Chrome: webm/opus). */
export function pickRecordingMime(isSupported: (t: string) => boolean): string | undefined {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  });
}
