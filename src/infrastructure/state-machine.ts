import { EventBus } from "../core/event-bus";
import type { SEOEventType } from "../types/events";

export interface Transition<S extends string> {
  from: S;
  to: S;
  event?: string;
  guard?: () => boolean | Promise<boolean>;
}

export class StateMachine<S extends string> {
  private current: S;
  private transitions: Transition<S>[] = [];
  private bus?: EventBus;

  constructor(initialState: S, transitions: Transition<S>[], bus?: EventBus) {
    this.current = initialState;
    this.transitions = transitions;
    this.bus = bus;
  }

  getState(): S {
    return this.current;
  }

  canTransition(to: S): boolean {
    return this.transitions.some(
      (t) => t.from === this.current && t.to === to
    );
  }

  async transition(to: S): Promise<boolean> {
    const transition = this.transitions.find(
      (t) => t.from === this.current && t.to === to
    );
    if (!transition) return false;
    if (transition.guard) {
      const allowed = await transition.guard();
      if (!allowed) return false;
    }
    const from = this.current;
    this.current = to;
    const eventType = transition.event || "health:changed";
    this.bus?.emit(eventType as any, { from, to, state: to });
    return true;
  }

  addTransition(transition: Transition<S>): void {
    this.transitions.push(transition);
  }
}
