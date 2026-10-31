(() => {
  'use strict';
  // ── Constants ──
  const GATE_TYPES = Object.freeze(['AND', 'OR', 'XOR', 'NAND', 'NOR', 'NOT']);
  const MAX_TT_INPUTS = 6;
  const SOURCE_KINDS = Object.freeze(['INPUT', 'GATE', 'CLOCK', 'FF']);
  const SINK_KINDS = Object.freeze(['GATE', 'OUTPUT', 'FF']);
  const WIRE_CP_FACTOR = 0.45;
  const WIRE_CP_MIN = 50;
  const WIRE_COLORS = Object.freeze({
    true: '#00f0ff',
    false: '#1e1e32',
    trueGlow: 'rgba(0,240,255,0.25)'
  });
  const WIRE_ANIM_SPEED = 0.4; // pixels per ms
  const CLOCK_INTERVAL_MS = 500;
  const GATE_LOGIC = Object.freeze({
    AND: (a, b) => a && b,
    OR: (a, b) => a || b,
    XOR: (a, b) => Boolean(a) !== Boolean(b),
    NAND: (a, b) => !(a && b),
    NOR: (a, b) => !(a || b),
    NOT: (a) => !a
  });
  const GATE_SVGS = Object.freeze({
    AND: '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M4 2H20A14 14 0 0 1 20 26H4Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    OR: '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M4 2Q12 14 4 26Q22 26 34 14Q22 2 4 2Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    XOR: '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M6 2Q14 14 6 26Q24 26 36 14Q24 2 6 2Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2 2Q10 14 2 26" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    NAND: '<svg viewBox="0 0 42 28" aria-hidden="true"><path d="M4 2H18A14 14 0 0 1 18 26H4Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="35" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    NOR: '<svg viewBox="0 0 42 28" aria-hidden="true"><path d="M6 2Q14 14 6 26Q24 26 36 14Q24 2 6 2Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="38" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    NOT: '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M4 2L30 14L4 26Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="34" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
  });
  const FF_SVG = '<svg viewBox="0 0 40 28" aria-hidden="true"><rect x="6" y="2" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 17L12 20.5L6 24" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  const GATE_TABLES = Object.freeze({
    AND: [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 1]],
    OR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 1]],
    XOR: [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
    NAND: [[0, 0, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]],
    NOR: [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 1, 0]],
    NOT: [[0, 1], [1, 0]]
  });
  const CHALLENGES = Object.freeze({
    not: {
      inputs: 1,
      description: 'Build a circuit whose output is the opposite of its input.',
      hints: ['A NOT gate reverses a signal.', 'Connect one input to a NOT gate, then connect the gate to one output.'],
      evaluate: bits => !bits[0]
    },
    and: {
      inputs: 2,
      description: 'Turn the output on only when both inputs are on.',
      hints: ['The output should be false if either input is false.', 'An AND gate matches this rule.'],
      evaluate: bits => bits[0] && bits[1]
    },
    xor: {
      inputs: 2,
      description: 'Turn the output on when exactly one input is on.',
      hints: ['The output is off when both inputs match.', 'An XOR gate turns on when its inputs differ.'],
      evaluate: bits => bits[0] !== bits[1]
    },
    majority: {
      inputs: 3,
      description: 'Build a three-input majority vote: the output is on when at least two inputs are on.',
      hints: ['Check each pair of inputs for both being on.', 'Combine the three pairwise AND results with OR gates.'],
      evaluate: bits => bits.filter(Boolean).length >= 2
    }
  });
  const _esc = document.createElement('div');

  function escHTML(s) {
    _esc.textContent = s || '';
    return _esc.innerHTML;
  }

  function srAnnounce(m) {
    const e = document.getElementById('sr-announce');
    if (e) {
      e.textContent = '';
      requestAnimationFrame(() => {
        e.textContent = m;
      });
    }
  }

  // ── Undo Manager (data-only commands) ──
  class UndoManager {
    constructor(max = 60) {
      this._u = [];
      this._r = [];
      this._max = max;
      this._listeners = [];
    }
    push(cmd) {
      this._u.push(cmd);
      if (this._u.length > this._max) this._u.shift();
      this._r.length = 0;
      this._notify();
    }
    undo() {
      const c = this._u.pop();
      if (!c) return null;
      c.undo();
      this._r.push(c);
      this._notify();
      return c;
    }
    redo() {
      const c = this._r.pop();
      if (!c) return null;
      c.redo();
      this._u.push(c);
      this._notify();
      return c;
    }
    get canUndo() {
      return this._u.length > 0;
    }
    get canRedo() {
      return this._r.length > 0;
    }
    clear() {
      this._u.length = 0;
      this._r.length = 0;
      this._notify();
    }
    onChange(fn) {
      this._listeners.push(fn);
    }
    _notify() {
      for (const fn of this._listeners) fn();
    }
  }

  // ── Circuit Graph with persistent adjacency ──
  let _nid = 0,
    _wid = 0;
  class CircuitGraph {
    constructor() {
      this.nodes = new Map();
      this.wires = new Map();
      this._incoming = new Map(); // nodeId -> Map<wireId, wire>
      this._outgoing = new Map(); // nodeId -> Map<wireId, wire>
      this._topoCache = null;
      this._topoEpoch = -1;
      this._epoch = 0;
      this._dirtyNodes = new Set();
    }
    get epoch() {
      return this._epoch;
    }
    addNode(n) {
      this.nodes.set(n.id, n);
      this._incoming.set(n.id, new Map());
      this._outgoing.set(n.id, new Map());
      this._invalidateTopo();
    }
    removeNode(id) {
      const removed = [];
      const inc = this._incoming.get(id);
      if (inc)
        for (const [wid] of inc) removed.push(this.removeWire(wid));
      const out = this._outgoing.get(id);
      if (out)
        for (const [wid] of out) removed.push(this.removeWire(wid));
      this._incoming.delete(id);
      this._outgoing.delete(id);
      this.nodes.delete(id);
      this._invalidateTopo();
      return removed.filter(Boolean);
    }
    addWire(w) {
      if (w.srcNodeId === w.dstNodeId) return null;
      const src = this.nodes.get(w.srcNodeId),
        dst = this.nodes.get(w.dstNodeId);
      if (!src || !dst) return null;
      if (!SOURCE_KINDS.includes(src.kind)) return null;
      if (!SINK_KINDS.includes(dst.kind)) return null;
      if (w.srcPort !== 'out') return null;
      const vp = dst.kind === 'OUTPUT' ? ['in'] : ['in-a', 'in-b'];
      if (!vp.includes(w.dstPort)) return null;
      if (dst.kind === 'GATE' && dst.gateType === 'NOT' && w.dstPort === 'in-b') return null;
      if (this._wouldCycle(w.srcNodeId, w.dstNodeId)) return null;
      // Replace existing wire to same port
      let replaced = null;
      const incMap = this._incoming.get(w.dstNodeId);
      if (incMap)
        for (const [, ew] of incMap) {
          if (ew.dstPort === w.dstPort) {
            replaced = this._snapshotWire(ew);
            this._removeWireInternal(ew.id);
            break;
          }
        }
      this.wires.set(w.id, w);
      this._indexWire(w);
      this._invalidateTopo();
      return {
        wire: w,
        replacedWire: replaced
      };
    }
    removeWire(id) {
      const w = this.wires.get(id);
      if (!w) return null;
      const snap = this._snapshotWire(w);
      this._removeWireInternal(id);
      this._invalidateTopo();
      return snap;
    }
    _removeWireInternal(id) {
      const w = this.wires.get(id);
      if (!w) return;
      const inc = this._incoming.get(w.dstNodeId);
      if (inc) inc.delete(id);
      const out = this._outgoing.get(w.srcNodeId);
      if (out) out.delete(id);
      this.wires.delete(id);
    }
    _indexWire(w) {
      let inc = this._incoming.get(w.dstNodeId);
      if (!inc) {
        inc = new Map();
        this._incoming.set(w.dstNodeId, inc);
      }
      inc.set(w.id, w);
      let out = this._outgoing.get(w.srcNodeId);
      if (!out) {
        out = new Map();
        this._outgoing.set(w.srcNodeId, out);
      }
      out.set(w.id, w);
    }
    _snapshotWire(w) {
      return {
        id: w.id,
        srcNodeId: w.srcNodeId,
        srcPort: w.srcPort,
        dstNodeId: w.dstNodeId,
        dstPort: w.dstPort,
        value: w.value
      };
    }
    _invalidateTopo() {
      this._epoch++;
      this._topoCache = null;
    }
    // A wire INTO a flip-flop never counts as a loop, because the
    // flip-flop stores its value between clock ticks.
    _wouldCycle(srcId, dstId) {
      if (srcId === dstId) return true;
      if (this.nodes.get(dstId)?.kind === 'FF') return false;
      const visited = new Set(),
        q = [dstId];
      while (q.length) {
        const c = q.shift();
        if (c === srcId) return true;
        if (visited.has(c)) continue;
        visited.add(c);
        const out = this._outgoing.get(c);
        if (out)
          for (const [, w] of out)
            if (!visited.has(w.dstNodeId) && this.nodes.get(w.dstNodeId)?.kind !== 'FF') q.push(w.dstNodeId);
      }
      return false;
    }
    _ensureTopo() {
      if (this._topoCache && this._topoEpoch === this._epoch) return this._topoCache;
      const inDeg = new Map(),
        adj = new Map();
      this.nodes.forEach((_, id) => {
        inDeg.set(id, 0);
        adj.set(id, []);
      });
      this.wires.forEach(w => {
        // Wires into a flip-flop are not part of the combinational order
        if (this.nodes.get(w.dstNodeId)?.kind === 'FF') return;
        if (!adj.has(w.srcNodeId) || !inDeg.has(w.dstNodeId)) return;
        adj.get(w.srcNodeId).push(w.dstNodeId);
        inDeg.set(w.dstNodeId, inDeg.get(w.dstNodeId) + 1);
      });
      const q = [];
      inDeg.forEach((d, id) => {
        if (d === 0) q.push(id);
      });
      const order = [];
      while (q.length) {
        const c = q.shift();
        order.push(c);
        for (const nb of (adj.get(c) || [])) {
          const nd = inDeg.get(nb) - 1;
          inDeg.set(nb, nd);
          if (nd === 0) q.push(nb);
        }
      }
      this._topoCache = order;
      this._topoEpoch = this._epoch;
      return order;
    }
    markDirty(nodeId) {
      this._dirtyNodes.add(nodeId);
    }
    // Calculates one node's value from its inputs
    _computeNode(nid) {
      const node = this.nodes.get(nid);
      if (!node) return;
      if (node.kind === 'GATE') {
        node.inputValues.a = false;
        node.inputValues.b = false;
      }
      if (node.kind === 'OUTPUT') node.value = false;
      if (node.kind !== 'FF') { // a flip-flop keeps its stored value
        const inc = this._incoming.get(nid);
        if (inc)
          for (const [, w] of inc) {
            const sn = this.nodes.get(w.srcNodeId);
            if (!sn) continue;
            if (node.kind === 'GATE') {
              if (w.dstPort === 'in-a') node.inputValues.a = sn.value;
              else if (w.dstPort === 'in-b') node.inputValues.b = sn.value;
            } else if (node.kind === 'OUTPUT') node.value = sn.value;
          }
        if (node.kind === 'GATE') {
          const fn = GATE_LOGIC[node.gateType];
          if (fn) node.value = Boolean(node.gateType === 'NOT' ? fn(node.inputValues.a) : fn(node.inputValues.a, node.inputValues.b));
        }
      }
      const out = this._outgoing.get(nid);
      if (out)
        for (const [, w] of out) w.value = node.value;
    }
    // Reads the D (a) and CLK (b) values arriving at each flip-flop
    _readFFInputs() {
      this.nodes.forEach(n => {
        if (n.kind !== 'FF') return;
        n.inputValues.a = false;
        n.inputValues.b = false;
        const inc = this._incoming.get(n.id);
        if (inc)
          for (const [, w] of inc) {
            const sn = this.nodes.get(w.srcNodeId);
            if (!sn) continue;
            if (w.dstPort === 'in-a') n.inputValues.a = sn.value;
            else if (w.dstPort === 'in-b') n.inputValues.b = sn.value;
          }
      });
    }
    // Full evaluation (used when structure changes)
    evaluateFull() {
      for (const nid of this._ensureTopo()) this._computeNode(nid);
      this._readFFInputs();
      this._dirtyNodes.clear();
    }
    // On a rising clock edge, a flip-flop copies D into its stored value.
    // All flip-flops sample first, then all commit together.
    _latchFlipFlops() {
      const next = [];
      this.nodes.forEach(n => {
        if (n.kind !== 'FF') return;
        const clk = n.inputValues.b;
        next.push({
          n,
          clk,
          q: (clk && !n.prevClk) ? n.inputValues.a : n.value
        });
      });
      let changed = false;
      for (const {
          n,
          clk,
          q
        } of next) {
        if (q !== n.value) changed = true;
        n.value = q;
        n.prevClk = clk;
      }
      return changed;
    }
    // Evaluate, clock the flip-flops, and repeat until nothing changes
    settle(maxIter = 16) {
      this.evaluateFull();
      for (let i = 0; i < maxIter; i++) {
        if (!this._latchFlipFlops()) break;
        this.evaluateFull();
      }
    }
    // Remember the current clock level so loading a circuit doesn't fake a clock edge
    primeFlipFlops() {
      this.evaluateFull();
      this.nodes.forEach(n => {
        if (n.kind === 'FF') n.prevClk = n.inputValues.b;
      });
    }
    hasFF() {
      for (const n of this.nodes.values())
        if (n.kind === 'FF') return true;
      return false;
    }
    // Incremental evaluation: only propagate from dirty nodes downstream
    evaluateIncremental() {
      if (this._dirtyNodes.size === 0) return;
      const order = this._ensureTopo();
      const posMap = new Map();
      for (let i = 0; i < order.length; i++) posMap.set(order[i], i);
      const affected = new Set();
      const queue = [...this._dirtyNodes];
      while (queue.length) {
        const c = queue.shift();
        if (affected.has(c)) continue;
        affected.add(c);
        const out = this._outgoing.get(c);
        if (out)
          for (const [, w] of out)
            if (!affected.has(w.dstNodeId)) queue.push(w.dstNodeId);
      }
      const sorted = [...affected].sort((a, b) => (posMap.get(a) || 0) - (posMap.get(b) || 0));
      for (const nid of sorted) {
        this._computeNode(nid);
      }
      this._readFFInputs();
      this._dirtyNodes.clear();
      return sorted;
    }
    getIncoming(nid) {
      return this._incoming.get(nid);
    }
    getOutgoing(nid) {
      return this._outgoing.get(nid);
    }
    getWiresForNode(nid) {
      const r = [];
      const inc = this._incoming.get(nid);
      if (inc)
        for (const [, w] of inc) r.push(w);
      const out = this._outgoing.get(nid);
      if (out)
        for (const [, w] of out) r.push(w);
      return r;
    }
    getWireCount(nid) {
      const inc = this._incoming.get(nid);
      const out = this._outgoing.get(nid);
      return {
        inCount: inc ? inc.size : 0,
        outCount: out ? out.size : 0
      };
    }
    getNodesByKind(kind) {
      return [...this.nodes.values()].filter(n => n.kind === kind).sort((a, b) => a.label.localeCompare(b.label));
    }
    clearAllWires() {
      const snaps = [];
      this.wires.forEach(w => snaps.push(this._snapshotWire(w)));
      this.wires.clear();
      this._incoming.forEach(m => m.clear());
      this._outgoing.forEach(m => m.clear());
      this._invalidateTopo();
      return snaps;
    }
    clear() {
      this.wires.clear();
      this.nodes.clear();
      this._incoming.clear();
      this._outgoing.clear();
      this._invalidateTopo();
    }
    // Snapshot for truth table
    createSnapshot() {
      const s = {
        nodes: new Map(),
        wires: new Map()
      };
      this.nodes.forEach((n, id) => s.nodes.set(id, {
        value: n.value,
        a: n.inputValues.a,
        b: n.inputValues.b,
        prev: n.prevClk
      }));
      this.wires.forEach((w, id) => s.wires.set(id, {
        value: w.value
      }));
      return s;
    }
    restoreSnapshot(s) {
      s.nodes.forEach((d, id) => {
        const n = this.nodes.get(id);
        if (n) {
          n.value = d.value;
          n.inputValues.a = d.a;
          n.inputValues.b = d.b;
          n.prevClk = d.prev;
        }
      });
      s.wires.forEach((d, id) => {
        const w = this.wires.get(id);
        if (w) w.value = d.value;
      });
    }
    // ── Serialization ──
    toJSON() {
      const nodes = [],
        wires = [];
      this.nodes.forEach(n => nodes.push({
        id: n.id,
        kind: n.kind,
        gateType: n.gateType,
        x: n.x,
        y: n.y,
        label: n.label,
        value: n.value
      }));
      this.wires.forEach(w => wires.push({
        id: w.id,
        srcNodeId: w.srcNodeId,
        srcPort: w.srcPort,
        dstNodeId: w.dstNodeId,
        dstPort: w.dstPort
      }));
      return JSON.stringify({
        v: 3,
        nodes,
        wires
      });
    }
    static fromJSON(json) {
      const data = JSON.parse(json);
      if (!data.v || !data.nodes || !data.wires) throw new Error('Invalid circuit data');
      return data;
    }
  }

  // ── Wire Canvas Renderer (Canvas2D) ──
  class WireCanvasRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this._wires = [];
      this._wireMap = new Map();
      this._dirty = true;
      this._animOffset = 0;
      this._lastTime = 0;
      this._rafId = null;
      this._running = false;
    }
    setSize(w, h) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._dirty = true;
    }
    updateWire(wireId, srcX, srcY, dstX, dstY, value) {
      if (this._wireMap.has(wireId)) {
        const idx = this._wireMap.get(wireId);
        const e = this._wires[idx];
        if (e.srcX === srcX && e.srcY === srcY && e.dstX === dstX && e.dstY === dstY && e.value === value) return;
        e.srcX = srcX;
        e.srcY = srcY;
        e.dstX = dstX;
        e.dstY = dstY;
        e.value = value;
      } else {
        this._wireMap.set(wireId, this._wires.length);
        this._wires.push({
          id: wireId,
          srcX,
          srcY,
          dstX,
          dstY,
          value
        });
      }
      this._dirty = true;
      // Wake the renderer if it has gone to sleep
      if (!this._running) this.start();
    }
    removeWire(wireId) {
      if (!this._wireMap.has(wireId)) return;
      const idx = this._wireMap.get(wireId);
      this._wires.splice(idx, 1);
      this._wireMap.clear();
      this._wires.forEach((w, i) => this._wireMap.set(w.id, i));
      this._dirty = true;
      if (!this._running) this.start();
    }
    clear() {
      this._wires.length = 0;
      this._wireMap.clear();
      this._dirty = true;
      if (!this._running) this.start();
    }
    start() {
      if (this._running) return;
      this._running = true;
      this._lastTime = performance.now();
      this._tick(this._lastTime);
    }
    stop() {
      this._running = false;
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }
    _tick(now) {
      if (!this._running) return;
      const dt = now - this._lastTime;
      this._lastTime = now;
      let hasTrue = false;
      for (const w of this._wires)
        if (w.value) {
          hasTrue = true;
          break;
        }
      if (hasTrue) {
        this._animOffset = (this._animOffset + dt * WIRE_ANIM_SPEED) % 20;
        this._dirty = true;
      }
      if (this._dirty) {
        this._render();
        this._dirty = false;
      }
      // Keep running only while something is animated
      if (hasTrue) {
        this._rafId = requestAnimationFrame(t => this._tick(t));
      } else {
        this._running = false; // sleeps; updateWire() wakes it again
      }
    }
    _render() {
      const ctx = this.ctx;
      const w = this.canvas.width / (window.devicePixelRatio || 1);
      const h = this.canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);
      for (let pass = 0; pass < 2; pass++) {
        const drawTrue = pass === 1;
        for (const wire of this._wires) {
          if (wire.value !== drawTrue) continue;
          const {
            srcX,
            srcY,
            dstX,
            dstY
          } = wire;
          const dx = dstX - srcX;
          const cp = Math.max(Math.abs(dx) * WIRE_CP_FACTOR, WIRE_CP_MIN);
          ctx.beginPath();
          ctx.moveTo(srcX, srcY);
          ctx.bezierCurveTo(srcX + cp, srcY, dstX - cp, dstY, dstX, dstY);
          if (drawTrue) {
            ctx.strokeStyle = WIRE_COLORS.true;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 12]);
            ctx.lineDashOffset = -this._animOffset;
            ctx.shadowColor = WIRE_COLORS.trueGlow;
            ctx.shadowBlur = 8;
          } else {
            ctx.strokeStyle = WIRE_COLORS.false;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([3, 8]);
            ctx.lineDashOffset = 0;
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }
  }

  // ── DOM Renderer ──
  class Renderer {
    constructor(graph, worldEl, hitSvg, tempSvg, wireCanvas) {
      this.graph = graph;
      this.world = worldEl;
      this.hitSvg = hitSvg;
      this.tempSvg = tempSvg;
      this.wireCanvas = wireCanvas;
      this.nodeElements = new Map();
      this.hitElements = new Map();
      this._portOffsetCache = new Map();
    }
    _portCacheKey(node, pt) {
      return `${node.kind}:${node.gateType||''}:${pt}`;
    }
    _computePortOffset(el, pt) {
      const p = el.querySelector(`[data-port-type="${pt}"]`);
      if (!p) return null;
      return {
        dx: p.offsetLeft + p.offsetWidth / 2,
        dy: p.offsetTop + p.offsetHeight / 2
      };
    }
    _getPortOffset(node, pt) {
      const key = this._portCacheKey(node, pt);
      if (this._portOffsetCache.has(key)) return this._portOffsetCache.get(key);
      const el = this.nodeElements.get(node.id);
      if (!el) return null;
      const off = this._computePortOffset(el, pt);
      if (off) this._portOffsetCache.set(key, off);
      return off;
    }
    invalidatePortCache(node) {
      for (const pt of ['out', 'in', 'in-a', 'in-b'])
        this._portOffsetCache.delete(this._portCacheKey(node, pt));
    }
    getPortWorldCenter(nid, pt) {
      const node = this.graph.nodes.get(nid);
      if (!node) return null;
      const off = this._getPortOffset(node, pt);
      if (!off) return null;
      return {
        x: node.x + off.dx,
        y: node.y + off.dy
      };
    }
    computeWireBezier(srcX, srcY, dstX, dstY) {
      const dx = dstX - srcX;
      const cp = Math.max(Math.abs(dx) * WIRE_CP_FACTOR, WIRE_CP_MIN);
      return `M ${srcX} ${srcY} C ${srcX+cp} ${srcY}, ${dstX-cp} ${dstY}, ${dstX} ${dstY}`;
    }
    createNodeElement(node) {
      const el = document.createElement('div');
      el.classList.add('circuit-node');
      el.setAttribute('data-node-id', node.id);
      el.setAttribute('tabindex', '0');
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      el.style.animation = 'node-appear 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards';
      el.addEventListener('animationend', () => {
        el.style.animation = '';
      }, {
        once: true
      });
      const del = `<button class="delete-hint" data-action="delete-node" aria-label="Delete ${escHTML(node.label)}" tabindex="0">×</button>`;
      if (node.kind === 'INPUT') {
        el.classList.add('node-input');
        if (node.value) el.classList.add('state-true');
        el.setAttribute('role', 'switch');
        el.setAttribute('aria-checked', String(node.value));
        el.setAttribute('aria-label', `Input ${escHTML(node.label)}, value ${node.value?'1':'0'}`);
        el.innerHTML =
          `<span class="node-label">${escHTML(node.label)}</span>` +
          `<div class="node-toggle" data-action="toggle" role="presentation"></div>` +
          `<span class="input-val-label"><span class="state-icon ${node.value?'active':''}" aria-hidden="true"></span>${node.value?'1':'0'}</span>` +
          `<div class="port port-out" data-port-type="out" data-node-id="${node.id}" role="button" aria-label="Output port" tabindex="-1"></div>` + del;
      } else if (node.kind === 'CLOCK') {
        el.classList.add('node-input', 'node-clock');
        if (node.value) el.classList.add('state-true');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-label', `Clock, value ${node.value?'1':'0'}`);
        el.innerHTML =
          `<span class="node-label">CLK</span>` +
          `<span class="input-val-label"><span class="state-icon ${node.value?'active':''}" aria-hidden="true"></span>${node.value?'1':'0'}</span>` +
          `<div class="port port-out" data-port-type="out" data-node-id="${node.id}" role="button" aria-label="Output port" tabindex="-1"></div>` + del;
      } else if (node.kind === 'GATE') {
        el.classList.add('node-gate');
        el.setAttribute('data-type', node.gateType);
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `${node.gateType} gate, output ${node.value?'1':'0'}`);
        el.innerHTML =
          `<div class="port port-in-a" data-port-type="in-a" data-node-id="${node.id}" role="button" aria-label="Input A" tabindex="-1"></div>` +
          `<div class="port port-in-b" data-port-type="in-b" data-node-id="${node.id}" role="button" aria-label="Input B" tabindex="-1"></div>` +
          `<div class="gate-symbol">${GATE_SVGS[node.gateType]||''}</div>` +
          `<span class="gate-type-label">${escHTML(node.gateType)}</span>` +
          `<div class="port port-out" data-port-type="out" data-node-id="${node.id}" role="button" aria-label="Output port" tabindex="-1"></div>` +
          del + `<div class="gate-tooltip" role="tooltip">${this._tooltipHTML(node.gateType)}</div>`;
      } else if (node.kind === 'FF') {
        el.classList.add('node-gate', 'node-ff');
        if (node.value) el.classList.add('output-true');
        el.setAttribute('data-type', 'FF');
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `D flip-flop, Q ${node.value?'1':'0'}`);
        el.innerHTML =
          `<div class="port port-in-a" data-port-type="in-a" data-node-id="${node.id}" role="button" aria-label="D input" tabindex="-1"></div>` +
          `<div class="port port-in-b" data-port-type="in-b" data-node-id="${node.id}" role="button" aria-label="Clock input" tabindex="-1"></div>` +
          `<div class="gate-symbol">${FF_SVG}</div>` +
          `<span class="gate-type-label">D-FF</span>` +
          `<div class="port port-out" data-port-type="out" data-node-id="${node.id}" role="button" aria-label="Q output" tabindex="-1"></div>` + del;
      } else if (node.kind === 'OUTPUT') {
        el.classList.add('node-output');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-label', `Output ${escHTML(node.label)}, value ${node.value?'1':'0'}`);
        el.innerHTML =
          `<div class="port port-in" data-port-type="in" data-node-id="${node.id}" role="button" aria-label="Input port" tabindex="-1"></div>` +
          `<span class="node-label">${escHTML(node.label)}</span>` +
          `<span class="output-val"><span class="state-icon ${node.value?'active':''}" aria-hidden="true"></span>${node.value?'1':'0'}</span>` + del;
      }
      this.nodeElements.set(node.id, el);
      this.world.appendChild(el);
      requestAnimationFrame(() => this.invalidatePortCache(node));
      return el;
    }
    removeNodeElement(id) {
      const el = this.nodeElements.get(id);
      if (el) {
        el.remove();
        this.nodeElements.delete(id);
      }
    }
    _tooltipHTML(type) {
      const t = GATE_TABLES[type];
      if (!t) return '';
      const isNot = type === 'NOT';
      let h = '<table>';
      if (isNot) {
        h += '<tr><th>In</th><th>Out</th></tr>';
        for (const r of t) h += `<tr><td class="${r[0]?'v1':''}">${r[0]}</td><td class="${r[1]?'v1':''}">${r[1]}</td></tr>`;
      } else {
        h += '<tr><th>A</th><th>B</th><th>Out</th></tr>';
        for (const r of t) h += `<tr><td class="${r[0]?'v1':''}">${r[0]}</td><td class="${r[1]?'v1':''}">${r[1]}</td><td class="${r[2]?'v1':''}">${r[2]}</td></tr>`;
      }
      return h + '</table>';
    }
    updateNodeVisuals(node) {
      const el = this.nodeElements.get(node.id);
      if (!el) return;
      if (node.kind === 'INPUT' || node.kind === 'CLOCK') {
        el.classList.toggle('state-true', node.value);
        if (node.kind === 'INPUT') {
          el.setAttribute('aria-checked', String(node.value));
          el.setAttribute('aria-label', `Input ${node.label}, value ${node.value?'1':'0'}`);
        } else {
          el.setAttribute('aria-label', `Clock, value ${node.value?'1':'0'}`);
        }
        const p = el.querySelector('.port-out');
        if (p) p.classList.toggle('port-active', node.value);
        const vl = el.querySelector('.input-val-label');
        if (vl) {
          const ic = vl.querySelector('.state-icon');
          if (ic) ic.classList.toggle('active', node.value);
          vl.lastChild.textContent = node.value ? '1' : '0';
        }
      } else if (node.kind === 'GATE') {
        el.classList.toggle('output-true', node.value);
        el.setAttribute('data-type', node.gateType);
        el.setAttribute('aria-label', `${node.gateType} gate, output ${node.value?'1':'0'}`);
        const sym = el.querySelector('.gate-symbol');
        if (sym) sym.innerHTML = GATE_SVGS[node.gateType] || '';
        const lbl = el.querySelector('.gate-type-label');
        if (lbl) lbl.textContent = node.gateType;
        const tip = el.querySelector('.gate-tooltip');
        if (tip) tip.innerHTML = this._tooltipHTML(node.gateType);
        const pA = el.querySelector('.port-in-a'),
          pB = el.querySelector('.port-in-b'),
          pO = el.querySelector('.port-out');
        if (pA) pA.classList.toggle('port-active', node.inputValues.a);
        if (pB) pB.classList.toggle('port-active', node.inputValues.b);
        if (pO) pO.classList.toggle('port-active', node.value);
      } else if (node.kind === 'FF') {
        el.classList.toggle('output-true', node.value);
        el.setAttribute('aria-label', `D flip-flop, Q ${node.value?'1':'0'}`);
        el.querySelector('.port-in-a')?.classList.toggle('port-active', node.inputValues.a);
        el.querySelector('.port-in-b')?.classList.toggle('port-active', node.inputValues.b);
        el.querySelector('.port-out')?.classList.toggle('port-active', node.value);
      } else if (node.kind === 'OUTPUT') {
        el.classList.toggle('state-true', node.value);
        el.setAttribute('aria-label', `Output ${node.label}, value ${node.value?'1':'0'}`);
        const vl = el.querySelector('.output-val');
        if (vl) {
          const ic = vl.querySelector('.state-icon');
          if (ic) ic.classList.toggle('active', node.value);
          vl.lastChild.textContent = node.value ? '1' : '0';
        }
        const p = el.querySelector('.port-in');
        if (p) p.classList.toggle('port-active', node.value);
      }
    }
    updateWireVisuals(wire) {
      const src = this.getPortWorldCenter(wire.srcNodeId, wire.srcPort);
      const dst = this.getPortWorldCenter(wire.dstNodeId, wire.dstPort);
      if (!src || !dst) return;
      this.wireCanvas.updateWire(wire.id, src.x, src.y, dst.x, dst.y, wire.value);
      const d = this.computeWireBezier(src.x, src.y, dst.x, dst.y);
      let hit = this.hitElements.get(wire.id);
      if (!hit) {
        hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.classList.add('wire-hit');
        hit.setAttribute('data-wire-id', wire.id);
        this.hitSvg.appendChild(hit);
        this.hitElements.set(wire.id, hit);
      }
      hit.setAttribute('d', d);
    }
    removeWireVisuals(wireId) {
      this.wireCanvas.removeWire(wireId);
      const hit = this.hitElements.get(wireId);
      if (hit) {
        hit.remove();
        this.hitElements.delete(wireId);
      }
    }
    removeAllWireVisuals() {
      this.wireCanvas.clear();
      this.hitElements.forEach(h => h.remove());
      this.hitElements.clear();
    }
    removeAllElements() {
      this.removeAllWireVisuals();
      this.nodeElements.forEach(el => el.remove());
      this.nodeElements.clear();
      this._portOffsetCache.clear();
    }
    updateWiresForNode(nid) {
      const wires = this.graph.getWiresForNode(nid);
      for (const w of wires) this.updateWireVisuals(w);
    }
    updateAllVisuals() {
      this.graph.nodes.forEach(n => this.updateNodeVisuals(n));
      this.graph.wires.forEach(w => this.updateWireVisuals(w));
    }
    updateNodesAndWires(nodeIds) {
      const wiresDone = new Set();
      for (const nid of nodeIds) {
        const node = this.graph.nodes.get(nid);
        if (node) this.updateNodeVisuals(node);
        const wires = this.graph.getWiresForNode(nid);
        for (const w of wires) {
          if (!wiresDone.has(w.id)) {
            this.updateWireVisuals(w);
            wiresDone.add(w.id);
          }
        }
      }
    }
    resizeCanvas(viewW, viewH, zoom, panX, panY) {
      const worldW = viewW / zoom + 2000;
      const worldH = viewH / zoom + 2000;
      const offX = -panX / zoom - 1000;
      const offY = -panY / zoom - 1000;
      this.wireCanvas.canvas.style.left = offX + 'px';
      this.wireCanvas.canvas.style.top = offY + 'px';
      this.wireCanvas.setSize(worldW, worldH);
      this._canvasOffset = {
        x: offX,
        y: offY
      };
      this.graph.wires.forEach(w => {
        const src = this.getPortWorldCenter(w.srcNodeId, w.srcPort);
        const dst = this.getPortWorldCenter(w.dstNodeId, w.dstPort);
        if (src && dst) this.wireCanvas.updateWire(w.id, src.x - offX, src.y - offY, dst.x - offX, dst.y - offY, w.value);
      });
    }
  }

  // ── Truth Table Generator ──
  class TruthTableGenerator {
    constructor(graph) {
      this.graph = graph;
    }
    render(containerId) {
      const c = document.getElementById(containerId);
      if (!c) return;
      if (this.graph.hasFF()) {
        c.innerHTML = '<p class="truth-empty">Truth tables are not available for circuits with flip-flops.</p>';
        return;
      }
      const inputs = this.graph.getNodesByKind('INPUT');
      const outputs = this.graph.getNodesByKind('OUTPUT');
      if (!inputs.length || !outputs.length) {
        c.innerHTML = '<p class="truth-empty">Add inputs and outputs to see the truth table.</p>';
        return;
      }
      if (inputs.length > MAX_TT_INPUTS) {
        c.innerHTML = `<p class="truth-empty">Too many inputs (max ${MAX_TT_INPUTS}).</p>`;
        return;
      }
      const snap = this.graph.createSnapshot();
      const curVals = inputs.map(n => n.value);
      const rows = 1 << inputs.length;
      const data = [];
      let activeRow = -1;
      for (let i = 0; i < rows; i++) {
        const iv = [];
        for (let b = 0; b < inputs.length; b++) {
          const v = Boolean(i & (1 << (inputs.length - 1 - b)));
          inputs[b].value = v;
          iv.push(v);
        }
        this.graph.evaluateFull();
        data.push({
          iv,
          ov: outputs.map(n => n.value)
        });
        if (iv.every((v, j) => v === curVals[j])) activeRow = i;
      }
      this.graph.restoreSnapshot(snap);
      let h = '<table class="truth-table" role="table"><thead><tr>';
      for (const inp of inputs) h += `<th scope="col">${escHTML(inp.label)}</th>`;
      for (const out of outputs) h += `<th scope="col">${escHTML(out.label)}</th>`;
      h += '</tr></thead><tbody>';
      for (let i = 0; i < data.length; i++) {
        const r = data[i];
        h += i === activeRow ? '<tr class="active-row">' : '<tr>';
        for (const v of r.iv) {
          const n = v ? 1 : 0;
          h += `<td class="${n?'v1':''}">${n}</td>`;
        }
        for (const v of r.ov) {
          const n = v ? 1 : 0;
          h += `<td class="${n?'v1':''}">${n}</td>`;
        }
        h += '</tr>';
      }
      c.innerHTML = h + '</tbody></table>';
    }
  }

  // ── Inspector ──
  class Inspector {
    constructor(graph) {
      this.graph = graph;
      this.el = document.getElementById('inspector');
      this.content = document.getElementById('inspector-content');
      this.nodeId = null;
    }
    inspect(id) {
      this.nodeId = id;
      this.update();
      this.el.classList.remove('hidden');
    }
    hide() {
      this.nodeId = null;
      this.el.classList.add('hidden');
    }
    update() {
      if (!this.nodeId) return;
      const n = this.graph.nodes.get(this.nodeId);
      if (!n) {
        this.hide();
        return;
      }
      const r = (k, v, t) => `<div class="inspector-row"><span class="inspector-key">${escHTML(k)}</span><span class="inspector-val ${t?'val-true':''}">${escHTML(String(v))}</span></div>`;
      let h = r('ID', n.id, false) + r('Type', n.kind === 'GATE' ? n.gateType : n.kind, false) + r('Label', n.label, false);
      if (n.kind === 'INPUT' || n.kind === 'CLOCK') h += r('Value', n.value ? 'TRUE' : 'FALSE', n.value);
      else if (n.kind === 'GATE') {
        h += r('Input A', n.inputValues.a ? 'TRUE' : 'FALSE', n.inputValues.a);
        if (n.gateType !== 'NOT') h += r('Input B', n.inputValues.b ? 'TRUE' : 'FALSE', n.inputValues.b);
        h += r('Output', n.value ? 'TRUE' : 'FALSE', n.value);
      } else if (n.kind === 'FF') {
        h += r('D input', n.inputValues.a ? 'TRUE' : 'FALSE', n.inputValues.a);
        h += r('Clock', n.inputValues.b ? 'TRUE' : 'FALSE', n.inputValues.b);
        h += r('Q output', n.value ? 'TRUE' : 'FALSE', n.value);
      } else h += r('Value', n.value ? 'TRUE' : 'FALSE', n.value);
      const wc = this.graph.getWireCount(n.id);
      h += r('Wires In', wc.inCount, false) + r('Wires Out', wc.outCount, false);
      this.content.innerHTML = h;
    }
  }

  // ── App Controller ──
  class App {
    constructor() {
      this.graph = new CircuitGraph();
      this.worldEl = document.getElementById('world');
      this.hitSvg = document.getElementById('wire-hit-layer');
      this.tempSvg = document.getElementById('wire-temp-layer');
      this.viewport = document.getElementById('viewport');
      this.ctxMenu = document.getElementById('context-menu');
      this.undoToast = document.getElementById('undo-toast');
      this.undoToastMsg = document.getElementById('undo-toast-msg');
      this.undoToastBtn = document.getElementById('undo-toast-btn');
      const wireCanvasEl = document.getElementById('wire-canvas');
      this.wireCanvasRenderer = new WireCanvasRenderer(wireCanvasEl);
      this.renderer = new Renderer(this.graph, this.worldEl, this.hitSvg, this.tempSvg, this.wireCanvasRenderer);
      this.truthGen = new TruthTableGenerator(this.graph);
      this.inspector = new Inspector(this.graph);
      this.undoMgr = new UndoManager();
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.isDragging = false;
      this.dragNodeId = null;
      this.dragStartPos = null;
      this.dragOffset = {
        x: 0,
        y: 0
      };
      this.isPanning = false;
      this.panStart = {
        x: 0,
        y: 0
      };
      this.isWiring = false;
      this.wireStartNodeId = null;
      this.wireStartPortType = null;
      this.tempWirePath = null;
      this.selectedNodes = new Set();
      this.ctxNodeId = null;
      this.pendingEval = null;
      this.activePointerId = null;
      this._toastTimer = null;
      this._usedInputLabels = new Set();
      this._usedOutputLabels = new Set();
      this._selBoxStart = null;
      this._selBoxEl = null;
      this._structuralChange = false;
      this._storageTimer = null;
      this.activeChallengeId = '';
      this.challengeHintIndex = 0;
      this.clockTimer = null;
      this.undoMgr.onChange(() => this._updateUndoButtons());
      this._injectSequentialUI();
      this._bindEvents();
      this.centerView();
      this._resizeWireCanvas();
      this.wireCanvasRenderer.start();
      if (!this._restoreAutosave()) this.buildDefaultCircuit();
    }
    // Adds the CLK / D-FF toolbox buttons and the Clock / Step buttons if the HTML doesn't have them
    _injectSequentialUI() {
      const toolbox = document.getElementById('toolbox');
      if (toolbox) {
        for (const [type, label, title] of [
            ['CLOCK', 'CLK', 'Add clock'],
            ['FF', 'D-FF', 'Add D flip-flop']
          ]) {
          if (toolbox.querySelector(`[data-spawn="${type}"]`)) continue;
          const b = document.createElement('button');
          b.className = 'tool-btn';
          b.setAttribute('data-spawn', type);
          b.setAttribute('aria-label', title);
          b.title = title;
          b.innerHTML = `<span class="tool-label">${label}</span>`;
          toolbox.appendChild(b);
        }
      }
      const actions = document.querySelector('.top-actions');
      if (actions) {
        const make = (id, text) => {
          if (document.getElementById(id)) return;
          const b = document.createElement('button');
          b.className = 'action-btn';
          b.id = id;
          b.textContent = text;
          actions.insertBefore(b, actions.firstChild);
        };
        make('btn-step', 'Step');
        make('btn-clock', 'Clock: Off');
      }
    }
    _bumpIds(nodeId, wireId) {
      let m = /^n(\d+)$/.exec(nodeId || '');
      if (m) _nid = Math.max(_nid, Number(m[1]) + 1);
      m = /^w(\d+)$/.exec(wireId || '');
      if (m) _wid = Math.max(_wid, Number(m[1]) + 1);
    }
    _saveAutosave() {
      try {
        localStorage.setItem('logicLoom.autosave', JSON.stringify({
          version: 1,
          circuit: JSON.parse(this.graph.toJSON()),
          camera: {
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY
          }
        }));
      } catch (error) {
        console.warn('Logic Loom could not save this circuit locally.', error);
      }
    }
    _queueAutosave() {
      clearTimeout(this._storageTimer);
      this._storageTimer = setTimeout(() => this._saveAutosave(), 250);
    }
    _restoreAutosave() {
      try {
        const saved = JSON.parse(localStorage.getItem('logicLoom.autosave'));
        if (!saved || saved.version !== 1 || !saved.circuit || !Array.isArray(saved.circuit.nodes) || !Array.isArray(saved.circuit.wires)) return false;
        this._reset(true);
        for (const node of saved.circuit.nodes) this.spawnNode(node.kind, node.gateType, node.x, node.y, node.value, node.label, node.id);
        for (const wire of saved.circuit.wires) {
          this._bumpIds(null, wire.id);
          const restored = {
            ...wire,
            value: false
          };
          if (this.graph.addWire(restored)) this.renderer.updateWireVisuals(restored);
        }
        const camera = saved.camera || {};
        if (Number.isFinite(camera.zoom) && camera.zoom >= 0.15 && camera.zoom <= 4) this.zoom = camera.zoom;
        if (Number.isFinite(camera.panX)) this.panX = camera.panX;
        if (Number.isFinite(camera.panY)) this.panY = camera.panY;
        this.updateCamera();
        this.undoMgr.clear();
        this.graph.primeFlipFlops();
        this._structuralChange = true;
        this.scheduleEvaluation();
        return true;
      } catch (error) {
        console.warn('Logic Loom could not restore its local circuit.', error);
        return false;
      }
    }
    // ── Challenges ──
    _toggleChallengePanel(forceOpen) {
      const panel = document.getElementById('challenge-panel');
      const button = document.getElementById('btn-challenges');
      const open = forceOpen ?? panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', String(open));
      if (open) document.getElementById('challenge-select').focus();
    }
    _selectChallenge(id) {
      this.activeChallengeId = id;
      this.challengeHintIndex = 0;
      document.getElementById('challenge-hint-text').textContent = '';
      this._renderChallenge();
    }
    _renderChallenge() {
      const challenge = CHALLENGES[this.activeChallengeId];
      const description = document.getElementById('challenge-description');
      const feedback = document.getElementById('challenge-feedback');
      const tableWrap = document.getElementById('challenge-table-wrap');
      const hintButton = document.getElementById('challenge-hint');
      const startButton = document.getElementById('challenge-start');
      const hintText = document.getElementById('challenge-hint-text');
      if (!challenge) {
        description.textContent = 'Build a circuit, then choose a challenge to check it.';
        feedback.textContent = 'Choose a challenge to begin.';
        feedback.className = 'challenge-feedback';
        tableWrap.hidden = true;
        hintButton.disabled = true;
        startButton.disabled = true;
        hintText.textContent = '';
        return;
      }
      description.textContent = challenge.description;
      hintButton.disabled = false;
      startButton.disabled = false;
      hintButton.textContent = 'Show hint';
      tableWrap.hidden = false;
      const labels = ['A', 'B', 'C'].slice(0, challenge.inputs);
      let html = '<table class="truth-table" role="table"><thead><tr>';
      for (const label of labels) html += `<th scope="col">${label}</th>`;
      html += '<th scope="col">OUT</th></tr></thead><tbody>';
      const rowCount = 1 << challenge.inputs;
      for (let row = 0; row < rowCount; row++) {
        const bits = labels.map((_, index) => Boolean(row & (1 << (challenge.inputs - 1 - index))));
        const output = challenge.evaluate(bits) ? 1 : 0;
        html += '<tr>' + bits.map(bit => `<td class="${bit ? 'v1' : ''}">${bit ? 1 : 0}</td>`).join('') + `<td class="${output ? 'v1' : ''}">${output}</td></tr>`;
      }
      document.getElementById('challenge-table').innerHTML = html + '</tbody></table>';
      this._gradeChallenge();
    }
    _gradeChallenge() {
      const challenge = CHALLENGES[this.activeChallengeId];
      if (!challenge) return;
      const feedback = document.getElementById('challenge-feedback');
      const inputs = this.graph.getNodesByKind('INPUT');
      const outputs = this.graph.getNodesByKind('OUTPUT');
      if (inputs.length !== challenge.inputs) {
        feedback.textContent = `Add exactly ${challenge.inputs} input${challenge.inputs === 1 ? '' : 's'} to try this challenge. You have ${inputs.length}.`;
        feedback.className = 'challenge-feedback error';
        return;
      }
      if (outputs.length !== 1) {
        feedback.textContent = `Use exactly one output to check this challenge. You have ${outputs.length}.`;
        feedback.className = 'challenge-feedback error';
        return;
      }
      const snapshot = this.graph.createSnapshot();
      let incorrect = 0;
      const rows = 1 << challenge.inputs;
      try {
        for (let row = 0; row < rows; row++) {
          const bits = inputs.map((_, index) => Boolean(row & (1 << (challenge.inputs - 1 - index))));
          inputs.forEach((node, index) => {
            node.value = bits[index];
          });
          this.graph.evaluateFull();
          if (Boolean(outputs[0].value) !== Boolean(challenge.evaluate(bits))) incorrect++;
        }
      } finally {
        this.graph.restoreSnapshot(snapshot);
      }
      if (incorrect === 0) {
        feedback.textContent = `Nice work! Your circuit matches all ${rows} truth-table rows.`;
        feedback.className = 'challenge-feedback success';
      } else {
        feedback.textContent = `${incorrect} of ${rows} rows do not match yet. Change your circuit and try again.`;
        feedback.className = 'challenge-feedback error';
      }
    }
    _showChallengeHint() {
      const challenge = CHALLENGES[this.activeChallengeId];
      if (!challenge) return;
      const hint = challenge.hints[Math.min(this.challengeHintIndex, challenge.hints.length - 1)];
      document.getElementById('challenge-hint-text').textContent = hint;
      this.challengeHintIndex++;
      if (this.challengeHintIndex >= challenge.hints.length) document.getElementById('challenge-hint').textContent = 'Show hint again';
    }
    _startChallenge() {
      const challenge = CHALLENGES[this.activeChallengeId];
      if (!challenge) return;
      if (!confirm('Replace the current canvas with a fresh challenge setup? Save a backup first if you want to keep this circuit.')) return;
      this._reset(true);
      for (let index = 0; index < challenge.inputs; index++) {
        this.spawnNode('INPUT', null, 360, 150 + index * 110, false);
      }
      this.spawnNode('OUTPUT', null, 760, 150 + (challenge.inputs - 1) * 55, false);
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    // ── Camera ──
    updateCamera() {
      this.worldEl.style.transform = `translate(${this.panX}px,${this.panY}px) scale(${this.zoom})`;
      document.getElementById('zoom-indicator').textContent = `${Math.round(this.zoom*100)}%`;
      this._resizeWireCanvas();
      this._queueAutosave();
    }
    centerView() {
      this.panX = this.viewport.clientWidth / 2 - 600;
      this.panY = this.viewport.clientHeight / 2 - 300;
      this.updateCamera();
    }
    screenToWorld(sx, sy) {
      const r = this.viewport.getBoundingClientRect();
      return {
        x: (sx - r.left - this.panX) / this.zoom,
        y: (sy - r.top - this.panY) / this.zoom
      };
    }
    _resizeWireCanvas() {
      this.renderer.resizeCanvas(this.viewport.clientWidth, this.viewport.clientHeight, this.zoom, this.panX, this.panY);
    }
    // ── Labels ──
    _genLabel(kind) {
      if (kind === 'INPUT') {
        for (let i = 0;; i++) {
          const l = i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65+i%26)}${Math.floor(i/26)+1}`;
          if (!this._usedInputLabels.has(l)) {
            this._usedInputLabels.add(l);
            return l;
          }
        }
      }
      if (kind === 'OUTPUT') {
        for (let i = 0;; i++) {
          const l = i < 3 ? String.fromCharCode(88 + i) : `O${i+1}`;
          if (!this._usedOutputLabels.has(l)) {
            this._usedOutputLabels.add(l);
            return l;
          }
        }
      }
      return '';
    }
    _recycleLabel(n) {
      if (n.kind === 'INPUT') this._usedInputLabels.delete(n.label);
      else if (n.kind === 'OUTPUT') this._usedOutputLabels.delete(n.label);
    }
    _claimLabel(n) {
      if (n.kind === 'INPUT') this._usedInputLabels.add(n.label);
      else if (n.kind === 'OUTPUT') this._usedOutputLabels.add(n.label);
    }
    // ── Toast ──
    _showToast(msg, undoFn) {
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this.undoToastMsg.textContent = msg;
      this.undoToast.classList.add('visible');
      const clone = this.undoToastBtn.cloneNode(true);
      this.undoToastBtn.replaceWith(clone);
      this.undoToastBtn = clone;
      clone.addEventListener('click', () => {
        if (undoFn) undoFn();
        this.undoToast.classList.remove('visible');
      });
      this._toastTimer = setTimeout(() => this.undoToast.classList.remove('visible'), 5000);
    }
    _updateUndoButtons() {
      document.getElementById('btn-undo').disabled = !this.undoMgr.canUndo;
      document.getElementById('btn-redo').disabled = !this.undoMgr.canRedo;
    }
    // ── CRUD ──
    spawnNode(kind, gateType, x, y, initialValue = false, existingLabel = null, existingId = null) {
      const label = existingLabel || ((kind === 'INPUT' || kind === 'OUTPUT') ? this._genLabel(kind) :
        kind === 'CLOCK' ? 'CLK' : kind === 'FF' ? 'D-FF' : (gateType || 'GATE'));
      if (existingLabel) this._claimLabel({
        kind,
        label: existingLabel
      });
      if (existingId) this._bumpIds(existingId, null);
      const node = {
        id: existingId || `n${_nid++}`,
        kind,
        gateType,
        x,
        y,
        label,
        value: Boolean(initialValue),
        prevClk: false,
        inputValues: {
          a: false,
          b: false
        }
      };
      node.cycleType = function() {
        if (this.kind !== 'GATE') return this.gateType;
        const i = GATE_TYPES.indexOf(this.gateType);
        this.gateType = GATE_TYPES[(i + 1) % GATE_TYPES.length];
        return this.gateType;
      };
      this.graph.addNode(node);
      this.renderer.createNodeElement(node);
      this._structuralChange = true;
      this.scheduleEvaluation();
      return node;
    }
    _restoreNode(snap) {
      const node = {
        id: snap.id,
        kind: snap.kind,
        gateType: snap.gateType,
        x: snap.x,
        y: snap.y,
        label: snap.label,
        value: snap.value,
        prevClk: false,
        inputValues: {
          a: snap.inputA,
          b: snap.inputB
        }
      };
      node.cycleType = function() {
        if (this.kind !== 'GATE') return this.gateType;
        const i = GATE_TYPES.indexOf(this.gateType);
        this.gateType = GATE_TYPES[(i + 1) % GATE_TYPES.length];
        return this.gateType;
      };
      this._claimLabel(node);
      this.graph.addNode(node);
      this.renderer.createNodeElement(node);
      return node;
    }
    deleteNode(nodeId, recordUndo = true) {
      const node = this.graph.nodes.get(nodeId);
      if (!node) return;
      const snap = {
        id: node.id,
        kind: node.kind,
        gateType: node.gateType,
        x: node.x,
        y: node.y,
        label: node.label,
        value: node.value,
        inputA: node.inputValues.a,
        inputB: node.inputValues.b
      };
      const connWires = this.graph.getWiresForNode(nodeId).map(w => this.graph._snapshotWire(w));
      for (const ws of connWires) this.renderer.removeWireVisuals(ws.id);
      this.graph.removeNode(nodeId);
      this.renderer.removeNodeElement(nodeId);
      this._recycleLabel(node);
      this.selectedNodes.delete(nodeId);
      if (this.selectedNodes.size === 0) this.inspector.hide();
      if (recordUndo) {
        const desc = `Delete ${node.kind==='GATE'?node.gateType:node.kind} "${node.label}"`;
        this.undoMgr.push({
          description: desc,
          undo: () => {
            this._restoreNode(snap);
            for (const ws of connWires) {
              if (this.graph.nodes.has(ws.srcNodeId) && this.graph.nodes.has(ws.dstNodeId)) {
                const w = {
                  id: ws.id,
                  srcNodeId: ws.srcNodeId,
                  srcPort: ws.srcPort,
                  dstNodeId: ws.dstNodeId,
                  dstPort: ws.dstPort,
                  value: ws.value
                };
                this.graph.wires.set(w.id, w);
                this.graph._indexWire(w);
                this.graph._invalidateTopo();
                this.renderer.updateWireVisuals(w);
              }
            }
            this._structuralChange = true;
            this.scheduleEvaluation();
          },
          redo: () => {
            this.deleteNode(snap.id, false);
            this._structuralChange = true;
            this.scheduleEvaluation();
          }
        });
        this._showToast(desc, () => this.undoMgr.undo());
        srAnnounce(`Deleted ${node.label}`);
      }
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    selectNode(nodeId, additive = false) {
      if (!additive) {
        for (const id of this.selectedNodes) {
          const el = this.renderer.nodeElements.get(id);
          if (el) el.classList.remove('selected');
        }
        this.selectedNodes.clear();
      }
      if (nodeId) {
        this.selectedNodes.add(nodeId);
        const el = this.renderer.nodeElements.get(nodeId);
        if (el) el.classList.add('selected');
        this.inspector.inspect(nodeId);
      } else {
        this.inspector.hide();
      }
    }
    deselectNode(nodeId) {
      this.selectedNodes.delete(nodeId);
      const el = this.renderer.nodeElements.get(nodeId);
      if (el) el.classList.remove('selected');
      if (this.selectedNodes.size === 0) this.inspector.hide();
      else this.inspector.inspect([...this.selectedNodes][this.selectedNodes.size - 1]);
    }
    // ── Evaluation ──
    scheduleEvaluation() {
      this._queueAutosave();
      if (this.pendingEval) return;
      this.pendingEval = requestAnimationFrame(() => {
        this.pendingEval = null;
        if (this._structuralChange || this.graph.hasFF()) {
          this.graph.settle();
          this.renderer.updateAllVisuals();
          this._structuralChange = false;
        } else {
          const affected = this.graph.evaluateIncremental();
          if (affected && affected.length > 0) {
            this.renderer.updateNodesAndWires(affected);
          } else {
            this.graph.evaluateFull();
            this.renderer.updateAllVisuals();
          }
        }
        this._resizeWireCanvas();
        this.truthGen.render('truth-table-container');
        this._gradeChallenge();
        this.inspector.update();
      });
    }
    // ── Clock ──
    _toggleClock() {
      const btn = document.getElementById('btn-clock');
      if (this.clockTimer) {
        clearInterval(this.clockTimer);
        this.clockTimer = null;
        if (btn) btn.textContent = 'Clock: Off';
      } else {
        if (!this.graph.getNodesByKind('CLOCK').length) {
          this._showToast('Add a CLK node first');
          return;
        }
        this.clockTimer = setInterval(() => this._tickClock(), CLOCK_INTERVAL_MS);
        if (btn) btn.textContent = 'Clock: On';
      }
    }
    // Flips every clock node once. Every second flip is a rising edge.
    _tickClock() {
      const clocks = this.graph.getNodesByKind('CLOCK');
      if (!clocks.length) {
        this._showToast('Add a CLK node first');
        return;
      }
      for (const n of clocks) n.value = !n.value;
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    // ── Wiring ──
    startWiring(nodeId, portType) {
      const node = this.graph.nodes.get(nodeId);
      if (!node) return;
      const isOut = portType === 'out';
      if (isOut && node.kind === 'OUTPUT') return;
      if (!isOut && (node.kind === 'INPUT' || node.kind === 'CLOCK')) return;
      this.isWiring = true;
      this.wireStartNodeId = nodeId;
      this.wireStartPortType = portType;
      this.tempWirePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      this.tempWirePath.classList.add('wire-temp');
      this.tempSvg.appendChild(this.tempWirePath);
      this._highlightPorts(nodeId, portType);
    }
    _updateTempWire(wx, wy) {
      if (!this.tempWirePath) return;
      const src = this.renderer.getPortWorldCenter(this.wireStartNodeId, this.wireStartPortType);
      if (!src) return;
      const isOut = this.wireStartPortType === 'out';
      const d = isOut ? this.renderer.computeWireBezier(src.x, src.y, wx, wy) : this.renderer.computeWireBezier(wx, wy, src.x, src.y);
      this.tempWirePath.setAttribute('d', d);
    }
    finishWiring(targetNodeId, targetPortType) {
      if (!this.isWiring) return;
      const startIsOut = this.wireStartPortType === 'out';
      const targetIsOut = targetPortType === 'out';
      if (startIsOut === targetIsOut) {
        this._rejectWire(targetNodeId);
        this.cancelWiring();
        return;
      }
      let srcId, dstId, dstPort;
      if (startIsOut) {
        srcId = this.wireStartNodeId;
        dstId = targetNodeId;
        dstPort = targetPortType;
      } else {
        srcId = targetNodeId;
        dstId = this.wireStartNodeId;
        dstPort = this.wireStartPortType;
      }
      if (srcId === dstId) {
        this._rejectWire(targetNodeId);
        this.cancelWiring();
        return;
      }
      const w = {
        id: `w${_wid++}`,
        srcNodeId: srcId,
        srcPort: 'out',
        dstNodeId: dstId,
        dstPort,
        value: false
      };
      const result = this.graph.addWire(w);
      if (!result) {
        this._rejectWire(targetNodeId);
        this.cancelWiring();
        return;
      }
      if (result.replacedWire) this.renderer.removeWireVisuals(result.replacedWire.id);
      this.cancelWiring();
      this.renderer.updateWireVisuals(w);
      this.undoMgr.push({
        description: 'Add wire',
        undo: () => {
          this.graph.removeWire(w.id);
          this.renderer.removeWireVisuals(w.id);
          if (result.replacedWire) {
            const rw = result.replacedWire;
            const rwo = {
              id: rw.id,
              srcNodeId: rw.srcNodeId,
              srcPort: rw.srcPort,
              dstNodeId: rw.dstNodeId,
              dstPort: rw.dstPort,
              value: rw.value
            };
            this.graph.wires.set(rwo.id, rwo);
            this.graph._indexWire(rwo);
            this.graph._invalidateTopo();
            this.renderer.updateWireVisuals(rwo);
          }
          this._structuralChange = true;
          this.scheduleEvaluation();
        },
        redo: () => {
          if (result.replacedWire) {
            this.graph.removeWire(result.replacedWire.id);
            this.renderer.removeWireVisuals(result.replacedWire.id);
          }
          const rw = {
            id: w.id,
            srcNodeId: w.srcNodeId,
            srcPort: w.srcPort,
            dstNodeId: w.dstNodeId,
            dstPort: w.dstPort,
            value: false
          };
          this.graph.wires.set(rw.id, rw);
          this.graph._indexWire(rw);
          this.graph._invalidateTopo();
          this.renderer.updateWireVisuals(rw);
          this._structuralChange = true;
          this.scheduleEvaluation();
        }
      });
      srAnnounce('Wire connected');
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    _rejectWire(targetNodeId) {
      if (targetNodeId) {
        const el = this.renderer.nodeElements.get(targetNodeId);
        if (el) {
          el.classList.remove('wire-rejected');
          void el.offsetWidth;
          el.classList.add('wire-rejected');
          el.addEventListener('animationend', () => el.classList.remove('wire-rejected'), {
            once: true
          });
        }
      }
      if (this.tempWirePath) this.tempWirePath.classList.add('wire-invalid');
      srAnnounce('Connection rejected');
    }
    cancelWiring() {
      this.isWiring = false;
      this.wireStartNodeId = null;
      this.wireStartPortType = null;
      if (this.tempWirePath) {
        this.tempWirePath.remove();
        this.tempWirePath = null;
      }
      this._clearHighlights();
    }
    _highlightPorts(srcId, srcPt) {
      const isOut = srcPt === 'out';
      this.graph.nodes.forEach(node => {
        if (node.id === srcId) return;
        const el = this.renderer.nodeElements.get(node.id);
        if (!el) return;
        if (isOut) {
          if (node.kind === 'GATE' || node.kind === 'FF') {
            el.querySelector('.port-in-a')?.classList.add('highlight');
            if (node.kind === 'FF' || node.gateType !== 'NOT') el.querySelector('.port-in-b')?.classList.add('highlight');
          } else if (node.kind === 'OUTPUT') el.querySelector('.port-in')?.classList.add('highlight');
        } else {
          if (SOURCE_KINDS.includes(node.kind)) el.querySelector('.port-out')?.classList.add('highlight');
        }
      });
    }
    _clearHighlights() {
      this.worldEl.querySelectorAll('.port.highlight').forEach(p => p.classList.remove('highlight'));
    }
    // ── Events ──
    _bindEvents() {
      const vp = this.viewport;
      vp.addEventListener('pointerdown', this._onPointerDown.bind(this));
      vp.addEventListener('pointermove', this._onPointerMove.bind(this));
      vp.addEventListener('pointerup', this._onPointerUp.bind(this));
      vp.addEventListener('pointercancel', this._onPointerUp.bind(this));
      vp.addEventListener('wheel', this._onWheel.bind(this), {
        passive: false
      });
      vp.addEventListener('dblclick', this._onDblClick.bind(this));
      vp.addEventListener('contextmenu', this._onCtxMenu.bind(this));
      document.addEventListener('keydown', this._onKeyDown.bind(this));
      document.addEventListener('pointerdown', e => {
        if (!e.target.closest('.context-menu') && !e.target.closest('.circuit-node')) this.ctxMenu.classList.remove('visible');
      });
      document.getElementById('toolbox').addEventListener('click', this._onToolbox.bind(this));
      this.ctxMenu.addEventListener('click', this._onCtxClick.bind(this));
      document.getElementById('btn-undo').addEventListener('click', () => {
        const a = this.undoMgr.undo();
        if (a) srAnnounce(`Undone: ${a.description}`);
      });
      document.getElementById('btn-redo').addEventListener('click', () => {
        const a = this.undoMgr.redo();
        if (a) srAnnounce(`Redone: ${a.description}`);
      });
      document.getElementById('btn-save').addEventListener('click', () => this._saveCircuit());
      document.getElementById('btn-load').addEventListener('click', () => this._loadCircuit());
      document.getElementById('circuit-file-input').addEventListener('change', e => this._importCircuitFile(e));
      document.getElementById('btn-challenges').addEventListener('click', () => this._toggleChallengePanel());
      document.getElementById('challenge-close').addEventListener('click', () => this._toggleChallengePanel(false));
      document.getElementById('challenge-select').addEventListener('change', e => this._selectChallenge(e.target.value));
      document.getElementById('challenge-hint').addEventListener('click', () => this._showChallengeHint());
      document.getElementById('challenge-start').addEventListener('click', () => this._startChallenge());
      document.getElementById('btn-export-png').addEventListener('click', () => this._exportPNG());
      document.getElementById('btn-randomize').addEventListener('click', () => this._randomize());
      document.getElementById('btn-clear-wires').addEventListener('click', () => this._clearWiresUndo());
      document.getElementById('btn-reset').addEventListener('click', () => this._reset());
      document.getElementById('btn-clock')?.addEventListener('click', () => this._toggleClock());
      document.getElementById('btn-step')?.addEventListener('click', () => this._tickClock());
      window.addEventListener('resize', () => {
        this._resizeWireCanvas();
      });
    }
    _onPointerDown(e) {
      const port = e.target.closest('.port');
      const toggle = e.target.closest('[data-action="toggle"]');
      const delBtn = e.target.closest('[data-action="delete-node"]');
      const nodeEl = e.target.closest('.circuit-node');
      const wireHit = e.target.closest('.wire-hit');
      if (port) {
        e.preventDefault();
        e.stopPropagation();
        const nid = port.getAttribute('data-node-id'),
          pt = port.getAttribute('data-port-type');
        if (nid && pt) this.startWiring(nid, pt);
        return;
      }
      if (toggle && nodeEl) {
        e.preventDefault();
        e.stopPropagation();
        const nid = nodeEl.getAttribute('data-node-id'),
          node = this.graph.nodes.get(nid);
        if (node && node.kind === 'INPUT') {
          const old = node.value;
          node.value = !node.value;
          this.graph.markDirty(nid);
          this.undoMgr.push({
            description: `Toggle ${node.label}`,
            undo: () => {
              node.value = old;
              this.graph.markDirty(nid);
              this.scheduleEvaluation();
            },
            redo: () => {
              node.value = !old;
              this.graph.markDirty(nid);
              this.scheduleEvaluation();
            }
          });
          this.scheduleEvaluation();
        }
        return;
      }
      if (delBtn && nodeEl) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteNode(nodeEl.getAttribute('data-node-id'));
        return;
      }
      if (wireHit) {
        e.preventDefault();
        e.stopPropagation();
        const wid = wireHit.getAttribute('data-wire-id');
        if (wid && this.graph.wires.has(wid)) this._deleteWireUndo(wid);
        return;
      }
      if (nodeEl) {
        e.preventDefault();
        e.stopPropagation();
        const nid = nodeEl.getAttribute('data-node-id');
        const node = this.graph.nodes.get(nid);
        if (!node) return;
        if (e.shiftKey) {
          if (this.selectedNodes.has(nid)) this.deselectNode(nid);
          else this.selectNode(nid, true);
        } else this.selectNode(nid, false);
        this.isDragging = true;
        this.dragNodeId = nid;
        this.dragStartPos = {
          x: node.x,
          y: node.y
        };
        this.activePointerId = e.pointerId;
        const wp = this.screenToWorld(e.clientX, e.clientY);
        this.dragOffset.x = wp.x - node.x;
        this.dragOffset.y = wp.y - node.y;
        this._multiDragOffsets = new Map();
        if (this.selectedNodes.size > 1 && this.selectedNodes.has(nid)) {
          for (const sid of this.selectedNodes) {
            const sn = this.graph.nodes.get(sid);
            if (sn) this._multiDragOffsets.set(sid, {
              x: wp.x - sn.x,
              y: wp.y - sn.y
            });
          }
        }
        this._multiDragStarts = new Map();
        for (const sid of this.selectedNodes) {
          const sn = this.graph.nodes.get(sid);
          if (sn) this._multiDragStarts.set(sid, {
            x: sn.x,
            y: sn.y
          });
        }
        this.viewport.setPointerCapture(e.pointerId);
        return;
      }
      // Start selection box or pan
      if (e.shiftKey) {
        e.preventDefault();
        this._selBoxStart = this.screenToWorld(e.clientX, e.clientY);
        this._selBoxEl = document.createElement('div');
        this._selBoxEl.classList.add('selection-box');
        this.worldEl.appendChild(this._selBoxEl);
        this.activePointerId = e.pointerId;
        this.viewport.setPointerCapture(e.pointerId);
        return;
      }
      this.selectNode(null);
      this.isPanning = true;
      this.activePointerId = e.pointerId;
      this.panStart.x = e.clientX - this.panX;
      this.panStart.y = e.clientY - this.panY;
      this.viewport.classList.add('panning');
      this.viewport.setPointerCapture(e.pointerId);
    }
    _onPointerMove(e) {
      if (this.isWiring) {
        this._updateTempWire(...Object.values(this.screenToWorld(e.clientX, e.clientY)));
        return;
      }
      if (this._selBoxStart) {
        const wp = this.screenToWorld(e.clientX, e.clientY);
        const x1 = Math.min(this._selBoxStart.x, wp.x),
          y1 = Math.min(this._selBoxStart.y, wp.y);
        const x2 = Math.max(this._selBoxStart.x, wp.x),
          y2 = Math.max(this._selBoxStart.y, wp.y);
        if (this._selBoxEl) {
          this._selBoxEl.style.left = x1 + 'px';
          this._selBoxEl.style.top = y1 + 'px';
          this._selBoxEl.style.width = (x2 - x1) + 'px';
          this._selBoxEl.style.height = (y2 - y1) + 'px';
        }
        return;
      }
      if (this.isDragging && this.dragNodeId) {
        const wp = this.screenToWorld(e.clientX, e.clientY);
        if (this._multiDragOffsets.size > 1) {
          for (const [sid, off] of this._multiDragOffsets) {
            const sn = this.graph.nodes.get(sid);
            if (!sn) continue;
            sn.x = wp.x - off.x;
            sn.y = wp.y - off.y;
            const el = this.renderer.nodeElements.get(sid);
            if (el) {
              el.style.left = `${sn.x}px`;
              el.style.top = `${sn.y}px`;
            }
            this.renderer.updateWiresForNode(sid);
          }
        } else {
          const node = this.graph.nodes.get(this.dragNodeId);
          if (!node) return;
          node.x = wp.x - this.dragOffset.x;
          node.y = wp.y - this.dragOffset.y;
          const el = this.renderer.nodeElements.get(this.dragNodeId);
          if (el) {
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
          }
          this.renderer.updateWiresForNode(this.dragNodeId);
        }
        this._resizeWireCanvas();
        return;
      }
      if (this.isPanning) {
        this.panX = e.clientX - this.panStart.x;
        this.panY = e.clientY - this.panStart.y;
        this.updateCamera();
      }
    }
    _onPointerUp(e) {
      if (this.isWiring) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        let found = null;
        for (const el of els) {
          const p = el.closest('.port');
          if (p) {
            const nid = p.getAttribute('data-node-id');
            if (nid && nid !== this.wireStartNodeId) {
              found = p;
              break;
            }
          }
        }
        if (found) this.finishWiring(found.getAttribute('data-node-id'), found.getAttribute('data-port-type'));
        else this.cancelWiring();
        return;
      }
      if (this._selBoxStart) {
        const wp = this.screenToWorld(e.clientX, e.clientY);
        const x1 = Math.min(this._selBoxStart.x, wp.x),
          y1 = Math.min(this._selBoxStart.y, wp.y);
        const x2 = Math.max(this._selBoxStart.x, wp.x),
          y2 = Math.max(this._selBoxStart.y, wp.y);
        this.graph.nodes.forEach(n => {
          const el = this.renderer.nodeElements.get(n.id);
          if (!el) return;
          const nw = el.offsetWidth,
            nh = el.offsetHeight;
          const cx = n.x + nw / 2,
            cy = n.y + nh / 2;
          if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) this.selectNode(n.id, true);
        });
        if (this._selBoxEl) {
          this._selBoxEl.remove();
          this._selBoxEl = null;
        }
        this._selBoxStart = null;
        try {
          this.viewport.releasePointerCapture(this.activePointerId);
        } catch (_) {}
        this.activePointerId = null;
        return;
      }
      // Record drag undo
      if (this.isDragging && this.dragNodeId && this._multiDragStarts) {
        const moves = [];
        for (const [sid, start] of this._multiDragStarts) {
          const n = this.graph.nodes.get(sid);
          if (n && (Math.abs(n.x - start.x) > 2 || Math.abs(n.y - start.y) > 2)) {
            moves.push({
              id: sid,
              sx: start.x,
              sy: start.y,
              ex: n.x,
              ey: n.y
            });
          }
        }
        if (moves.length > 0) {
          this.undoMgr.push({
            description: `Move ${moves.length} node(s)`,
            undo: () => {
              for (const m of moves) {
                const n = this.graph.nodes.get(m.id);
                if (!n) continue;
                n.x = m.sx;
                n.y = m.sy;
                const el = this.renderer.nodeElements.get(m.id);
                if (el) {
                  el.style.left = `${n.x}px`;
                  el.style.top = `${n.y}px`;
                }
                this.renderer.updateWiresForNode(m.id);
              }
              this._resizeWireCanvas();
            },
            redo: () => {
              for (const m of moves) {
                const n = this.graph.nodes.get(m.id);
                if (!n) continue;
                n.x = m.ex;
                n.y = m.ey;
                const el = this.renderer.nodeElements.get(m.id);
                if (el) {
                  el.style.left = `${n.x}px`;
                  el.style.top = `${n.y}px`;
                }
                this.renderer.updateWiresForNode(m.id);
              }
              this._resizeWireCanvas();
            }
          });
        }
        this._multiDragStarts = null;
        this._multiDragOffsets = new Map();
      }
      try {
        this.viewport.releasePointerCapture(this.activePointerId);
      } catch (_) {}
      this.isDragging = false;
      this.dragNodeId = null;
      this.dragStartPos = null;
      this.isPanning = false;
      this.activePointerId = null;
      this.viewport.classList.remove('panning');
    }
    _onWheel(e) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      const newZoom = Math.max(0.15, Math.min(4, this.zoom * factor));
      const r = this.viewport.getBoundingClientRect();
      const mx = e.clientX - r.left,
        my = e.clientY - r.top;
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
      this.updateCamera();
    }
    _onDblClick(e) {
      const nodeEl = e.target.closest('.node-gate');
      if (!nodeEl) return;
      const nid = nodeEl.getAttribute('data-node-id');
      const node = this.graph.nodes.get(nid);
      if (!node || node.kind !== 'GATE') return;
      const oldType = node.gateType;
      node.cycleType();
      this.renderer.invalidatePortCache(node);
      const sym = nodeEl.querySelector('.gate-symbol');
      if (sym) {
        sym.classList.remove('morphing');
        void sym.offsetWidth;
        sym.classList.add('morphing');
      }
      this.undoMgr.push({
        description: `Cycle ${oldType} → ${node.gateType}`,
        undo: () => {
          node.gateType = oldType;
          this.renderer.invalidatePortCache(node);
          this._structuralChange = true;
          this.scheduleEvaluation();
        },
        redo: () => {
          node.cycleType();
          this.renderer.invalidatePortCache(node);
          this._structuralChange = true;
          this.scheduleEvaluation();
        }
      });
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    _onCtxMenu(e) {
      e.preventDefault();
      const nodeEl = e.target.closest('.circuit-node');
      if (!nodeEl) {
        this.ctxMenu.classList.remove('visible');
        return;
      }
      this.ctxNodeId = nodeEl.getAttribute('data-node-id');
      const node = this.graph.nodes.get(this.ctxNodeId);
      if (!node) return;
      this.ctxMenu.querySelector('[data-action="cycle"]').style.display = node.kind === 'GATE' ? 'block' : 'none';
      this.ctxMenu.style.left = '0';
      this.ctxMenu.style.top = '0';
      this.ctxMenu.classList.add('visible');
      const mr = this.ctxMenu.getBoundingClientRect();
      this.ctxMenu.style.left = `${Math.max(0,Math.min(e.clientX,innerWidth-mr.width-4))}px`;
      this.ctxMenu.style.top = `${Math.max(0,Math.min(e.clientY,innerHeight-mr.height-4))}px`;
    }
    _onCtxClick(e) {
      const action = e.target.getAttribute('data-action');
      if (!action || !this.ctxNodeId) return;
      const node = this.graph.nodes.get(this.ctxNodeId);
      if (node) {
        if (action === 'cycle' && node.kind === 'GATE') {
          const old = node.gateType;
          node.cycleType();
          this.renderer.invalidatePortCache(node);
          const sym = this.renderer.nodeElements.get(node.id)?.querySelector('.gate-symbol');
          if (sym) {
            sym.classList.remove('morphing');
            void sym.offsetWidth;
            sym.classList.add('morphing');
          }
          this.undoMgr.push({
            description: `Cycle gate`,
            undo: () => {
              node.gateType = old;
              this.renderer.invalidatePortCache(node);
              this._structuralChange = true;
              this.scheduleEvaluation();
            },
            redo: () => {
              node.cycleType();
              this.renderer.invalidatePortCache(node);
              this._structuralChange = true;
              this.scheduleEvaluation();
            }
          });
          this._structuralChange = true;
          this.scheduleEvaluation();
        } else if (action === 'duplicate') {
          const nn = this.spawnNode(node.kind, node.gateType, node.x + 40, node.y + 40, node.kind === 'INPUT' ? node.value : false);
          this.undoMgr.push({
            description: `Duplicate`,
            undo: () => this.deleteNode(nn.id, false),
            redo: () => this.spawnNode(nn.kind, nn.gateType, nn.x, nn.y, nn.kind === 'INPUT' ? nn.value : false)
          });
          srAnnounce(`Duplicated ${node.label}`);
        } else if (action === 'delete') this.deleteNode(this.ctxNodeId);
      }
      this.ctxMenu.classList.remove('visible');
      this.ctxNodeId = null;
    }
    _onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const a = this.undoMgr.undo();
        if (a) srAnnounce(`Undone: ${a.description}`);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const a = this.undoMgr.redo();
        if (a) srAnnounce(`Redone: ${a.description}`);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._saveCircuit();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        this.graph.nodes.forEach(n => this.selectNode(n.id, true));
        return;
      }
      const focused = document.activeElement;
      const focusedNode = focused?.closest('.circuit-node');
      if (focusedNode) {
        const nid = focusedNode.getAttribute('data-node-id');
        const node = nid ? this.graph.nodes.get(nid) : null;
        if ((e.key === 'Enter' || e.key === ' ') && node) {
          e.preventDefault();
          if (node.kind === 'INPUT') {
            const old = node.value;
            node.value = !node.value;
            this.graph.markDirty(nid);
            this.undoMgr.push({
              description: `Toggle ${node.label}`,
              undo: () => {
                node.value = old;
                this.graph.markDirty(nid);
                this.scheduleEvaluation();
              },
              redo: () => {
                node.value = !old;
                this.graph.markDirty(nid);
                this.scheduleEvaluation();
              }
            });
            this.scheduleEvaluation();
            srAnnounce(`${node.label} set to ${node.value?'1':'0'}`);
          } else if (node.kind === 'CLOCK') {
            this._tickClock();
          } else if (node.kind === 'GATE') {
            const old = node.gateType;
            node.cycleType();
            this.renderer.invalidatePortCache(node);
            this.undoMgr.push({
              description: `Cycle gate`,
              undo: () => {
                node.gateType = old;
                this.renderer.invalidatePortCache(node);
                this._structuralChange = true;
                this.scheduleEvaluation();
              },
              redo: () => {
                node.cycleType();
                this.renderer.invalidatePortCache(node);
                this._structuralChange = true;
                this.scheduleEvaluation();
              }
            });
            this._structuralChange = true;
            this.scheduleEvaluation();
            srAnnounce(`Gate changed to ${node.gateType}`);
          }
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && node) {
          e.preventDefault();
          this.deleteNode(nid);
          return;
        }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && node) {
          e.preventDefault();
          const all = [...this.graph.nodes.values()];
          if (all.length <= 1) return;
          let best = null,
            bestD = Infinity;
          for (const o of all) {
            if (o.id === node.id) continue;
            const dx = o.x - node.x,
              dy = o.y - node.y;
            let s = Infinity;
            if (e.key === 'ArrowRight' && dx > 20) s = Math.abs(dy) + dx * .5;
            else if (e.key === 'ArrowLeft' && dx < -20) s = Math.abs(dy) + Math.abs(dx) * .5;
            else if (e.key === 'ArrowDown' && dy > 20) s = Math.abs(dx) + dy * .5;
            else if (e.key === 'ArrowUp' && dy < -20) s = Math.abs(dx) + Math.abs(dy) * .5;
            if (s < bestD) {
              bestD = s;
              best = o;
            }
          }
          if (best) {
            const tel = this.renderer.nodeElements.get(best.id);
            if (tel) {
              tel.focus();
              this.selectNode(best.id, e.shiftKey);
            }
          }
          return;
        }
      }
      if (e.target !== document.body && !focusedNode) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedNodes.size > 0) {
        e.preventDefault();
        const ids = [...this.selectedNodes];
        for (const id of ids) this.deleteNode(id);
      }
      if (e.key === 'Escape') {
        if (this.isWiring) this.cancelWiring();
        this.selectNode(null);
        this.ctxMenu.classList.remove('visible');
      }
    }
    _onToolbox(e) {
      const btn = e.target.closest('.tool-btn');
      if (!btn) return;
      const type = btn.getAttribute('data-spawn');
      const center = this.screenToWorld(this.viewport.clientWidth / 2, this.viewport.clientHeight / 2);
      const ox = (Math.random() - .5) * 100,
        oy = (Math.random() - .5) * 100;
      let nn;
      if (type === 'INPUT') nn = this.spawnNode('INPUT', null, center.x + ox, center.y + oy);
      else if (type === 'OUTPUT') nn = this.spawnNode('OUTPUT', null, center.x + ox, center.y + oy);
      else if (type === 'CLOCK') nn = this.spawnNode('CLOCK', null, center.x + ox, center.y + oy);
      else if (type === 'FF') nn = this.spawnNode('FF', null, center.x + ox, center.y + oy);
      else nn = this.spawnNode('GATE', type, center.x + ox, center.y + oy);
      if (nn) {
        this.undoMgr.push({
          description: `Add ${nn.kind==='GATE'?nn.gateType:nn.kind}`,
          undo: () => this.deleteNode(nn.id, false),
          redo: () => this.spawnNode(nn.kind, nn.gateType, nn.x, nn.y, nn.kind === 'INPUT' ? nn.value : false)
        });
        srAnnounce(`Added ${nn.kind==='GATE'?nn.gateType+' gate':nn.kind.toLowerCase()} ${nn.label}`);
        requestAnimationFrame(() => {
          const el = this.renderer.nodeElements.get(nn.id);
          if (el) el.focus();
        });
      }
    }
    _deleteWireUndo(wid) {
      const snap = this.graph._snapshotWire(this.graph.wires.get(wid));
      if (!snap) return;
      this.graph.removeWire(wid);
      this.renderer.removeWireVisuals(wid);
      this.undoMgr.push({
        description: 'Delete wire',
        undo: () => {
          if (this.graph.nodes.has(snap.srcNodeId) && this.graph.nodes.has(snap.dstNodeId)) {
            const w = {
              id: snap.id,
              srcNodeId: snap.srcNodeId,
              srcPort: snap.srcPort,
              dstNodeId: snap.dstNodeId,
              dstPort: snap.dstPort,
              value: snap.value
            };
            this.graph.wires.set(w.id, w);
            this.graph._indexWire(w);
            this.graph._invalidateTopo();
            this.renderer.updateWireVisuals(w);
          }
          this._structuralChange = true;
          this.scheduleEvaluation();
        },
        redo: () => {
          this.graph.removeWire(snap.id);
          this.renderer.removeWireVisuals(snap.id);
          this._structuralChange = true;
          this.scheduleEvaluation();
        }
      });
      this._showToast('Wire deleted', () => this.undoMgr.undo());
      srAnnounce('Wire deleted');
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    _clearWiresUndo() {
      const snaps = this.graph.clearAllWires();
      if (!snaps.length) return;
      this.renderer.removeAllWireVisuals();
      this.undoMgr.push({
        description: `Clear ${snaps.length} wires`,
        undo: () => {
          for (const s of snaps) {
            if (this.graph.nodes.has(s.srcNodeId) && this.graph.nodes.has(s.dstNodeId)) {
              const w = {
                id: s.id,
                srcNodeId: s.srcNodeId,
                srcPort: s.srcPort,
                dstNodeId: s.dstNodeId,
                dstPort: s.dstPort,
                value: s.value
              };
              this.graph.wires.set(w.id, w);
              this.graph._indexWire(w);
              this.graph._invalidateTopo();
              this.renderer.updateWireVisuals(w);
            }
          }
          this._structuralChange = true;
          this.scheduleEvaluation();
        },
        redo: () => {
          this.graph.clearAllWires();
          this.renderer.removeAllWireVisuals();
          this._structuralChange = true;
          this.scheduleEvaluation();
        }
      });
      srAnnounce(`Cleared ${snaps.length} wires`);
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
    _randomize() {
      const inputs = this.graph.getNodesByKind('INPUT');
      if (!inputs.length) return;
      const old = inputs.map(n => ({
        id: n.id,
        v: n.value
      }));
      const nv = inputs.map(() => Math.random() > .5);
      inputs.forEach((n, i) => {
        n.value = nv[i];
        this.graph.markDirty(n.id);
      });
      this.undoMgr.push({
        description: 'Randomize',
        undo: () => {
          for (const o of old) {
            const n = this.graph.nodes.get(o.id);
            if (n) {
              n.value = o.v;
              this.graph.markDirty(o.id);
            }
          }
          this.scheduleEvaluation();
        },
        redo: () => {
          inputs.forEach((n, i) => {
            n.value = nv[i];
            this.graph.markDirty(n.id);
          });
          this.scheduleEvaluation();
        }
      });
      srAnnounce('Inputs randomized');
      this.scheduleEvaluation();
    }
    // ── Serialization ──
    _saveCircuit() {
      try {
        clearTimeout(this._storageTimer);
        this._saveAutosave();
        const backup = {
          version: 1,
          circuit: JSON.parse(this.graph.toJSON()),
          camera: {
            zoom: this.zoom,
            panX: this.panX,
            panY: this.panY
          }
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `logic-loom-${new Date().toISOString().slice(0, 10)}.logicloom`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this._showToast('Circuit backup downloaded');
        srAnnounce('Circuit backup downloaded');
      } catch (e) {
        srAnnounce('Save failed');
      }
    }
    _exportPNG() {
      if (typeof html2canvas === 'undefined') {
        this._showToast('PNG export is unavailable (html2canvas not loaded)');
        return;
      }
      const viewport = document.getElementById('viewport');
      html2canvas(viewport, {
        backgroundColor: null,
        scale: 2
      }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'logic-loom.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        this._showToast('PNG exported!');
      }).catch(err => {
        console.error(err);
        this._showToast('Export failed');
      });
    }
    _loadCircuit() {
      document.getElementById('circuit-file-input').click();
    }
    _importCircuitFile(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const saved = parsed.circuit ? parsed : {
            circuit: CircuitGraph.fromJSON(reader.result)
          };
          const data = saved.circuit;
          if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.wires)) throw new Error('Invalid circuit data');
          if (data.nodes.some(node => !node.id || !['INPUT', 'GATE', 'OUTPUT', 'CLOCK', 'FF'].includes(node.kind) || !Number.isFinite(node.x) || !Number.isFinite(node.y))) throw new Error('Invalid node data');
          this._reset(true);
          for (const node of data.nodes) this.spawnNode(node.kind, node.gateType, node.x, node.y, node.value, node.label, node.id);
          for (const wire of data.wires) {
            this._bumpIds(null, wire.id);
            const restored = {
              ...wire,
              id: wire.id || `w${_wid++}`,
              value: false
            };
            if (this.graph.addWire(restored)) this.renderer.updateWireVisuals(restored);
          }
          const camera = saved.camera || {};
          if (Number.isFinite(camera.zoom) && camera.zoom >= 0.15 && camera.zoom <= 4) this.zoom = camera.zoom;
          if (Number.isFinite(camera.panX)) this.panX = camera.panX;
          if (Number.isFinite(camera.panY)) this.panY = camera.panY;
          this.updateCamera();
          this.undoMgr.clear();
          this.graph.primeFlipFlops();
          this._structuralChange = true;
          this.scheduleEvaluation();
          this._showToast('Circuit backup loaded');
          srAnnounce('Circuit backup loaded');
        } catch (error) {
          console.warn('Could not load circuit backup.', error);
          this._showToast('Invalid circuit backup');
          srAnnounce('Load failed: invalid circuit backup');
        }
      };
      reader.onerror = () => {
        this._showToast('Could not read circuit backup');
        srAnnounce('Load failed: could not read file');
      };
      reader.readAsText(file);
    }
    _reset(skipDefault = false) {
      this.cancelWiring();
      this.isDragging = false;
      this.isPanning = false;
      this.selectedNodes.clear();
      this.inspector.hide();
      this.renderer.removeAllElements();
      this.graph.clear();
      this._usedInputLabels.clear();
      this._usedOutputLabels.clear();
      _nid = 0;
      _wid = 0;
      this.undoMgr.clear();
      if (this.pendingEval) {
        cancelAnimationFrame(this.pendingEval);
        this.pendingEval = null;
      }
      srAnnounce('Circuit reset');
      if (!skipDefault) this.buildDefaultCircuit();
    }
    buildDefaultCircuit() {
      const bx = 400,
        by = 150;
      const inA = this.spawnNode('INPUT', null, bx, by, true);
      const inB = this.spawnNode('INPUT', null, bx, by + 110, false);
      const inC = this.spawnNode('INPUT', null, bx, by + 220, true);
      const inD = this.spawnNode('INPUT', null, bx, by + 330, false);
      const g0 = this.spawnNode('GATE', 'AND', bx + 200, by + 30);
      const g1 = this.spawnNode('GATE', 'OR', bx + 200, by + 150);
      const g2 = this.spawnNode('GATE', 'NAND', bx + 200, by + 270);
      const g3 = this.spawnNode('GATE', 'OR', bx + 420, by + 80);
      const g4 = this.spawnNode('GATE', 'XOR', bx + 420, by + 200);
      const g5 = this.spawnNode('GATE', 'NOT', bx + 420, by + 320);
      const outX = this.spawnNode('OUTPUT', null, bx + 620, by + 110);
      const outY = this.spawnNode('OUTPUT', null, bx + 620, by + 280);
      const conns = [
        [inA.id, 'out', g0.id, 'in-a'],
        [inB.id, 'out', g0.id, 'in-b'],
        [inB.id, 'out', g1.id, 'in-a'],
        [inC.id, 'out', g1.id, 'in-b'],
        [inC.id, 'out', g2.id, 'in-a'],
        [inD.id, 'out', g2.id, 'in-b'],
        [g0.id, 'out', g3.id, 'in-a'],
        [g1.id, 'out', g3.id, 'in-b'],
        [g1.id, 'out', g4.id, 'in-a'],
        [g2.id, 'out', g4.id, 'in-b'],
        [g4.id, 'out', g5.id, 'in-a'],
        [g3.id, 'out', outX.id, 'in'],
        [g5.id, 'out', outY.id, 'in']
      ];
      for (const [s, sp, d, dp] of conns) {
        const w = {
          id: `w${_wid++}`,
          srcNodeId: s,
          srcPort: sp,
          dstNodeId: d,
          dstPort: dp,
          value: false
        };
        const result = this.graph.addWire(w);
        if (result) this.renderer.updateWireVisuals(w);
      }
      this.undoMgr.clear();
      this._structuralChange = true;
      this.scheduleEvaluation();
    }
  }
  new App();
})();

// ── Background colour picker (theme) ──
const themeBtn = document.getElementById("themeBtn");
const resetTheme = document.getElementById("resetTheme");
const bgPicker = document.getElementById("bgPicker");
// Load saved background color
const savedColor = localStorage.getItem("backgroundColor");

if (savedColor) {
  document.documentElement.style.setProperty("--bg-primary", savedColor);
  bgPicker.value = savedColor;
}

themeBtn.addEventListener("click", () => {
  bgPicker.click();
});

bgPicker.addEventListener("input", () => {
  document.documentElement.style.setProperty("--bg-primary", bgPicker.value);
  // Save the selected color
  localStorage.setItem("backgroundColor", bgPicker.value);
});

resetTheme.addEventListener("click", () => {
  const defaultColor = "#0a0a12";
  document.documentElement.style.setProperty("--bg-primary", defaultColor);
  bgPicker.value = defaultColor;
  localStorage.removeItem("backgroundColor");
});