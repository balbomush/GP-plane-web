/** A feature request may update only its current selection and session. */
export class Lifetime {
  private slots = new Map<string, AbortController>();
  constructor(private session: {epoch(): number; isCurrent(epoch: number): boolean}) {}
  async run<T = any>(key: string, load: (signal: AbortSignal) => Promise<T>, apply: (data: T) => void, fail: (error: Error & {code?:string}) => void) {
    this.slots.get(key)?.abort();
    const controller = new AbortController(), epoch = this.session.epoch();
    this.slots.set(key, controller);
    const current = () => this.slots.get(key) === controller && !controller.signal.aborted && this.session.isCurrent(epoch);
    try { const value = await load(controller.signal); if (current()) apply(value); }
    catch (e) { if (current()) fail(e instanceof Error ? e : new Error(String(e))); }
    finally { if (this.slots.get(key) === controller) this.slots.delete(key); }
  }
  dispose() { for (const c of this.slots.values()) c.abort(); this.slots.clear(); }
  cancel(key:string){this.slots.get(key)?.abort();this.slots.delete(key);}
}
