import { ENGINE_BUILD } from './engineBuild.js';

// Stockfish runs in a dedicated local worker. No board state or PGN leaves the browser.
// Serialize UCI searches: wait for bestmove after stop before accepting another position.
export class LocalEngine {
  constructor() {
    this.listeners = new Set();
    this.failures = new Set();
    this.queue = Promise.resolve();
    this.closed = false;
    this.fatal = null;
    this.worker = new Worker(ENGINE_BUILD.workerUrl);
    this.worker.onmessage = event => {
      for (const line of String(event.data).split('\n')) {
        for (const listener of [...this.listeners]) listener(line.trim());
      }
    };
    this.worker.onerror = () => {
      const error = new Error('Stockfish could not start. Use a browser with WebAssembly enabled, then retry.');
      this.crash(error);
    };
    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('The local engine took too long to load. Please retry.')), 35000);
      const finish = error => {
        clearTimeout(timer);
        this.listeners.delete(listen); this.failures.delete(finish);
        if (error) reject(error); else resolve();
      };
      const listen = line => {
        if (line === 'uciok') {
          this.send('setoption name Hash value 24');
          this.send('setoption name Threads value 1');
          this.send('isready');
        }
        if (line === 'readyok') finish();
      };
      this.listeners.add(listen); this.failures.add(finish); this.send('uci');
    });
    this.ready.catch(() => {});
  }
  send(command) { if (!this.closed) this.worker.postMessage(command); }
  crash(error) {
    this.fatal = error;
    for (const listener of [...this.failures]) listener(error);
    this.closed = true; this.worker.terminate();
    this.listeners.clear(); this.failures.clear();
  }
  // `fresh` clears Stockfish's transposition table first (ucinewgame + isready),
  // so an evaluation depends only on its own root/history and limits, never on
  // whichever game, position or branch the shared worker searched before.
  // `nodes` replaces wall-clock movetime with a deterministic node budget.
  analyze({ fen, position, multiPv = 1, depth = 18, ms = 2500, nodes: nodeLimit = null, fresh = false, searchMoves = [], signal, onUpdate }) {
    if (!Array.isArray(searchMoves) || searchMoves.some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return Promise.reject(new Error('Invalid restricted-search UCI moves.'));
    if (nodeLimit !== null && !(Number.isInteger(nodeLimit) && nodeLimit > 0)) return Promise.reject(new Error('Invalid node budget.'));
    const task = this.queue.catch(() => {}).then(async () => {
      await this.ready;
      if (this.fatal) throw this.fatal;
      if (this.closed || signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (fresh) await this.clearHash(signal);
      return new Promise((resolve, reject) => {
        const lines = new Map();
        // Completed MultiPV iterations only. A time/node stop can interrupt an
        // iteration after rank 1 printed depth N+1 but before rank 2 did; mixing
        // ranks from different depths would invent a PV1-PV2 gap.
        const iterations = new Map();
        const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
        let cancelled = false, settled = false, nodes = 0, nps = 0;
        const completeDepth = () => {
          // Deepest depth at which every requested rank (bounded by legal moves,
          // reported via the highest rank ever seen) has an exact line.
          const ranks = Math.max(0, ...[...iterations.values()].flatMap(map => [...map.keys()]));
          return [...iterations.keys()].sort((a, b) => b - a).find(d => iterations.get(d).size >= Math.min(multiPv, ranks)) ?? null;
        };
        const snapshot = () => {
          const sorted = [...lines.values()].sort((a, b) => a.rank - b.rank);
          const depthComplete = completeDepth();
          const complete = depthComplete === null ? [] : [...iterations.get(depthComplete).values()].sort((a, b) => a.rank - b.rank);
          return { lines: sorted, completeLines: complete, completeDepth: depthComplete, nodes, nps };
        };
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer); clearTimeout(abortTimer);
          this.listeners.delete(listen); this.failures.delete(fail);
          signal?.removeEventListener('abort', abort);
          if (error) reject(error); else resolve(result);
        };
        const fail = error => finish(error);
        let abortTimer;
        const abort = () => {
          cancelled = true; this.send('stop');
          abortTimer = setTimeout(() => {
            const error = new Error('Engine did not acknowledge stop. Retry the engine to restart it.');
            this.crash(error);
          }, 6000);
        };
        const timer = setTimeout(() => {
          this.crash(new Error('Engine search timed out. Retry the analysis to restart it.'));
        }, ms + 15000);
        const listen = line => {
          if (line.startsWith('info depth') && !line.includes(' upperbound') && !line.includes(' lowerbound')) {
            const score = line.match(/\bscore (cp|mate) (-?\d+)/);
            const d = line.match(/\bdepth (\d+)/);
            const pv = line.match(/\bpv (.+)/);
            if (score && d && pv && !cancelled) {
              const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] || 1);
              const raw = Number(score[2]);
              const mate = score[1] === 'mate' ? raw * sign : null;
              const cp = mate === null ? raw * sign : raw === 0 ? -sign * 100000 : (mate > 0 ? 1 : -1) * (100000 - Math.abs(mate) * 100);
              const entry = { rank, depth: Number(d[1]), cp, mate, pv: pv[1].trim().split(/\s+/) };
              if (!lines.has(rank) || lines.get(rank).depth <= entry.depth) lines.set(rank, entry);
              if (!iterations.has(entry.depth)) iterations.set(entry.depth, new Map());
              iterations.get(entry.depth).set(rank, entry);
              nodes = Number(line.match(/\bnodes (\d+)/)?.[1] || nodes);
              nps = Number(line.match(/\bnps (\d+)/)?.[1] || nps);
              onUpdate?.(snapshot());
            }
          }
          if (line.startsWith('bestmove ')) {
            if (cancelled) finish(new DOMException('Cancelled', 'AbortError'));
            else {
              const bestMove = line.split(' ')[1];
              const data = snapshot();
              if (!data.lines.length && !['0000', '(none)'].includes(bestMove)) finish(new Error('No evaluation was returned. Retry the engine.'));
              else finish(null, { ...data, bestMove });
            }
          }
        };
        this.listeners.add(listen); this.failures.add(fail);
        signal?.addEventListener('abort', abort, { once: true });
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.send(position || `position fen ${fen}`);
        this.send(`go depth ${depth} ${nodeLimit ? `nodes ${nodeLimit}` : `movetime ${ms}`}${searchMoves.length ? ` searchmoves ${searchMoves.join(' ')}` : ''}`);
      });
    });
    this.queue = task;
    return task;
  }
  clearHash(signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listen); this.crash(new Error('Engine did not confirm a cleared search table. Retry the analysis.')); reject(this.fatal); }, 6000);
      const listen = line => { if (line === 'readyok') { clearTimeout(timer); this.listeners.delete(listen); if (signal?.aborted) reject(new DOMException('Cancelled', 'AbortError')); else resolve(); } };
      this.listeners.add(listen);
      this.send('ucinewgame'); this.send('isready');
    });
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    for (const listener of [...this.failures]) listener(new DOMException('Cancelled', 'AbortError'));
    this.worker.terminate(); this.listeners.clear(); this.failures.clear();
  }
}
