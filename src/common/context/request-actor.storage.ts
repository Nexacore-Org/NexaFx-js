import { AsyncLocalStorage } from 'async_hooks';

/**
 * Carries the real admin behind an impersonated session for the duration of a
 * request, so audit entries written deep in the call stack can name the actor.
 */
export interface RequestActor {
  actorId: string;
}

export const requestActorStorage = new AsyncLocalStorage<RequestActor>();

export function getRequestActorId(): string | undefined {
  return requestActorStorage.getStore()?.actorId;
}
