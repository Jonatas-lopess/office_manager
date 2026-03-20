import { DB } from "@vlcn.io/crsqlite-wasm";

type UpdateCallback = () => void;

/**
 * DBChangeHub multiplexes the single `onUpdate` hook from crsqlite-wasm
 * to support multiple independent listeners.
 */
export class DBChangeHub {
  private listeners: Set<UpdateCallback> = new Set();
  private cleanup: (() => void) | null = null;

  constructor(private db: DB) {
    this.init();
  }

  private init() {
    this.cleanup = this.db.onUpdate(() => {
      this.broadcast();
    });
  }

  private broadcast() {
    setTimeout(() => {
      this.listeners.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.error("[DBChangeHub] Error in listener callback:", err);
        }
      });
    }, 0);
  }

  /**
   * Subscribes a callback to database changes.
   * Returns an unsubscribe function.
   */
  subscribe(cb: UpdateCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Resets the underlying listener if needed (e.g., after DB re-init)
   */
  rebind(db: DB) {
    if (this.cleanup) {
      this.cleanup();
    }
    this.db = db;
    this.init();
  }

  destroy() {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
    this.listeners.clear();
  }
}
