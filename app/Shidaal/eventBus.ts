// Tiny React Native–safe event bus (no Node 'events' import)

type Handler<T = any> = (payload: T) => void;

class TinyBus<EvtMap extends Record<string, any>> {
  private map = new Map<keyof EvtMap, Set<Handler>>();

  on<K extends keyof EvtMap>(event: K, handler: Handler<EvtMap[K]>) {
    const set = this.map.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.map.set(event, set);
    // return unsubscribe function
    return () => this.off(event, handler);
  }

  off<K extends keyof EvtMap>(event: K, handler: Handler<EvtMap[K]>) {
    const set = this.map.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.map.delete(event);
  }

  emit<K extends keyof EvtMap>(event: K, payload: EvtMap[K]) {
    const set = this.map.get(event);
    if (!set) return;
    // copy to avoid mutation issues if a handler unsubscribes during emit
    [...set].forEach((fn) => fn(payload));
  }

  once<K extends keyof EvtMap>(event: K, handler: Handler<EvtMap[K]>) {
    const off = this.on(event, (p) => {
      off();
      handler(p);
    });
    return off;
  }
}

// Define your events + payloads (use `void` if no payload)
type AppEvents = {
  'vendor:payment:created': { id?: number } | void;
  'vendor:extraCost:created': { id?: number } | void;
};

export const events = new TinyBus<AppEvents>();

export const EVT_VENDOR_PAYMENT_CREATED = 'vendor:payment:created' as const;
export const EVT_EXTRA_COST_CREATED = 'vendor:extraCost:created' as const;
