import { LocalEngine } from './engine.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); promise.catch(() => {}); return { promise, resolve, reject }; };
// Exclusive ownership spans an entire review, including gaps between searches.
// Pause releases only AFTER native stop/bestmove acknowledgement. A client facade
// cancels its own jobs; the coordinator alone owns the single shared worker.
export function createEngineCoordinator({ createEngine = () => new LocalEngine(), locks = globalThis.navigator?.locks } = {}) {
  let engine = null, queue = Promise.resolve(), disposed = false, active = null;
  let state = { role: null, status: 'idle', message: '' };
  const listeners = new Set(), clients = new Set();
  const cancelled = () => new DOMException('Analysis ownership cancelled', 'AbortError');
  const emit = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    createClient(role, onPreempt = () => {}) {
      if (!['review', 'position', 'batch'].includes(role)) throw new Error('Unknown engine owner.');
      let ticket = null;
      const requests = new Set(), priority = { batch: 10, review: 20, position: 30 }[role];
      const release = () => { if (ticket?.cancelled && !requests.size) ticket.released.resolve(); };
      const acquire = () => {
        if (client.closed || disposed) return Promise.reject(cancelled());
        if (ticket && !ticket.cancelled) return ticket.ready.promise;
        if (ticket?.cancelled) return queue.then(() => acquire());
        if (active && active.client !== client && priority > active.priority) { active.client.onPreempt(role); active.client.cancel(); }
        const next = { client, priority, cancelled: false, ready: deferred(), released: deferred() }; ticket = next;
        queue = queue.catch(() => {}).then(async () => {
          if (disposed || client.closed || next.cancelled) throw cancelled();
          if (!locks?.request) throw new Error('Exclusive local analysis requires Web Locks support. Saved evidence and the legal board remain available; use a current supported browser.');
          emit({ role, status: 'waiting', message: 'Checking exclusive browser analysis ownership…' });
          await locks.request('linea-stockfish-job-owner', { mode: 'exclusive', ifAvailable: true }, async lock => {
            if (!lock) throw new Error('Another Linea tab is analyzing. Pause it, then Resume here.');
            if (disposed || client.closed || next.cancelled) throw cancelled();
            active = next;
            if (!engine || engine.closed || engine.fatal) { engine?.dispose(); engine = createEngine(); }
            emit({ status: 'loading', message: 'Loading the shared local Stockfish engine…' });
            try { await engine.ready; } catch (error) { engine?.dispose(); engine = null; throw error; }
            if (next.cancelled || disposed) throw cancelled();
            emit({ status: 'running', message: role === 'position' ? 'Live position analysis' : role === 'review' ? 'Game review' : 'Batch review' });
            next.ready.resolve(engine);
            await next.released.promise;
          });
        }).catch(error => { next.ready.reject(error); }).finally(() => {
          if (ticket === next) ticket = null;
          if (active === next) { active = null; emit({ role: null, status: 'idle', message: '' }); }
        });
        return next.ready.promise;
      };
      const client = { closed: false, fatal: null, role, onPreempt,
        get ready() { return acquire().then(() => {}); },
        async analyze(options) {
          if (client.closed || disposed || options.signal?.aborted) throw cancelled();
          const native = await acquire(), owner = ticket;
          if (!owner || owner.cancelled || client.closed || options.signal?.aborted) throw cancelled();
          const controller = new AbortController(); requests.add(controller);
          const abort = () => { controller.abort(); client.cancel(); };
          options.signal?.addEventListener('abort', abort, { once: true });
          if (options.signal?.aborted) abort();
          try { return await native.analyze({ ...options, signal: controller.signal }); }
          finally { requests.delete(controller); options.signal?.removeEventListener('abort', abort); release(); }
        },
        cancel() {
          if (ticket) { ticket.cancelled = true; ticket.ready.reject(cancelled()); }
          for (const controller of requests) controller.abort();
          release();
        },
        dispose() { client.closed = true; client.cancel(); clients.delete(client); },
      };
      clients.add(client); return client;
    },
    async pauseAll() {
      for (const client of clients) { client.onPreempt('hidden'); client.cancel(); }
      await queue.catch(() => {});
    },
    dispose() { disposed = true; for (const client of clients) client.dispose(); engine?.dispose(); engine = null; listeners.clear(); },
  };
}
