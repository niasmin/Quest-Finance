// Pixel-art sprites, generated once at startup and cached as canvases.
// Every art pixel is drawn as a PX×PX block; draw with imageSmoothingEnabled = false.
(function (root) {
  const PX = 3;
  const TILE = 16 * PX; // world pixels per map tile

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // amt > 0 lightens toward white, amt < 0 darkens toward black
  function shade(hex, amt) {
    const target = amt > 0 ? 255 : 0;
    const a = Math.abs(amt);
    const [r, g, b] = hexToRgb(hex).map((v) => Math.round(v + (target - v) * a));
    return `rgb(${r},${g},${b})`;
  }

  // Deterministic hash for tile variation, so every client sees the same map
  function hash(x, y, seed = 0) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------- pixel maps ----------
  function fromMap(rows, palette) {
    const c = makeCanvas(rows[0].length * PX, rows.length * PX);
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (!color) continue;
        g.fillStyle = color;
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    });
    return c;
  }

  // ---------- characters ----------
  // o outline, h hair, s skin, e eye, m mouth, w outer clothes, c inner shirt, p pants, b shoes
  const BODY = [
    '...oooooo...',
    '..ohhhhhho..',
    '.ohhhhhhhho.',
    '.ohssssssho.',
    '.osesssseso.',
    '.osssmmssso.',
    '..oossssoo..',
    '.owwccccwwo.',
    'owwwccccwwwo',
    'oswwccccwwso',
    '.owwccccwwo.',
    '.owwwwwwwwo.',
  ];
  const LEGS = [
    ['.oppo..oppo.', '.oppo..oppo.', '.obbo..obbo.', '............'],
    ['.oppo..oppo.', '..oppooppo..', '..obbo.obbo.', '............'],
  ];

  // Overlays: [x, y, paletteKey] painted on top of the body
  const GLASSES = [[2, 4, 'x'], [4, 4, 'x'], [5, 4, 'x'], [6, 4, 'x'], [7, 4, 'x'], [9, 4, 'x']];
  const OUTFITS = {
    doctor: { w: '#f4f4f4', c: '#4fa3f7', h: '#4a2c1a', p: '#2c3e66', x: '#4b4b4b', y: '#c9c9c9',
      extra: [[4, 7, 'x'], [7, 7, 'x'], [4, 8, 'x'], [7, 8, 'x'], [5, 9, 'x'], [6, 9, 'x'], [6, 10, 'y']] },
    nurse: { w: '#f78fb3', c: '#fbd0df', h: '#2b1b10', p: '#f78fb3', x: '#ffffff', y: '#e5484d',
      extra: [[3, 0, 'x'], [4, 0, 'x'], [5, 0, 'x'], [6, 0, 'x'], [7, 0, 'x'], [8, 0, 'x'], [4, 1, 'x'], [5, 1, 'y'], [6, 1, 'y'], [7, 1, 'x']] },
    pt: { w: '#2ecc71', c: '#ffffff', h: '#1a1a1a', p: '#34495e', x: '#e74c3c',
      extra: [2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 2, 'x']) },
    ot: { w: '#f5a623', c: '#fff3d6', h: '#8e5a2b', p: '#5d4037', x: '#3ee0c5',
      extra: [[3, 10, 'x'], [8, 10, 'x']] },
    dentist: { w: '#7fc8f8', c: '#7fc8f8', h: '#222222', p: '#7fc8f8', x: '#e3f4ff',
      extra: [[2, 5, 'x'], [3, 5, 'x'], [4, 5, 'x'], [5, 5, 'x'], [6, 5, 'x'], [7, 5, 'x'], [8, 5, 'x'], [9, 5, 'x'], [3, 6, 'x'], [4, 6, 'x'], [5, 6, 'x'], [6, 6, 'x'], [7, 6, 'x'], [8, 6, 'x']] },
    pharmacist: { w: '#f4f4f4', c: '#9b59b6', h: '#1f1f1f', p: '#3b3b58', x: '#333333', y: '#9b59b6',
      extra: [...GLASSES, [9, 8, 'y']] },
    medtech: { w: '#1abc9c', c: '#e8fff9', h: '#5b3a1e', p: '#2c3e50', x: '#2c3e50', y: '#9fe8ff',
      extra: [[2, 4, 'y'], [4, 4, 'y'], [5, 4, 'x'], [6, 4, 'x'], [7, 4, 'y'], [9, 4, 'y']] },
    radtech: { w: '#f1c40f', c: '#7f8c8d', h: '#3d2b1f', p: '#34495e', x: '#e74c3c',
      extra: [[8, 8, 'x']] },
    psychologist: { w: '#a0522d', c: '#f5deb3', h: '#95a5a6', p: '#4e342e', x: '#333333',
      extra: GLASSES },
    // NPCs
    director: { w: '#f4f4f4', c: '#c0392b', h: '#bdc3c7', p: '#2c3e50', x: '#333333',
      extra: [...GLASSES, [5, 8, 'c'], [6, 8, 'c']] },
    patient: { w: '#a7d8ee', c: '#a7d8ee', h: '#7f8c8d', p: '#a7d8ee', x: '#ffffff', y: '#e5484d',
      extra: [[2, 2, 'x'], [3, 2, 'x'], [4, 2, 'x'], [5, 2, 'x'], [6, 2, 'x'], [7, 2, 'x'], [8, 2, 'x'], [9, 2, 'x'], [6, 2, 'y']] },
    headNurse: { w: '#ffffff', c: '#dff3ff', h: '#5d4037', p: '#ffffff', x: '#ffffff', y: '#e5484d',
      extra: [[3, 0, 'x'], [4, 0, 'x'], [5, 0, 'y'], [6, 0, 'y'], [7, 0, 'x'], [8, 0, 'x'], [4, 1, 'x'], [7, 1, 'x']] },
  };

  function characterFrames(outfitId) {
    const o = OUTFITS[outfitId];
    const palette = { o: '#2b1d1a', s: '#f1c27d', e: '#2b1d1a', m: '#c0645a', b: '#3b2a20', ...o };
    return LEGS.map((legs) => {
      const rows = [...BODY, ...legs].map((r) => r.split(''));
      for (const [x, y, k] of o.extra || []) rows[y][x] = k;
      return fromMap(rows.map((r) => r.join('')), palette);
    });
  }

  // ---------- blobs: germs, trees ----------
  // Rasterize an inside(x, y) mask on an N×N grid, then shade and outline it.
  function blob(N, inside, color, { outline = '#2b1d1a', light = { x: -1, y: -1 } } = {}) {
    const mask = [];
    for (let y = 0; y < N; y++) {
      mask.push([]);
      for (let x = 0; x < N; x++) mask[y].push(inside(x, y));
    }
    const c = makeCanvas(N * PX, N * PX);
    const g = c.getContext('2d');
    const cx = (N - 1) / 2;
    const isIn = (x, y) => x >= 0 && y >= 0 && x < N && y < N && mask[y][x];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (mask[y][x]) {
          // Light from the top-left: highlight near that side, shadow on the far side
          const t = ((x - cx) * light.x + (y - cx) * light.y) / N;
          const edgeShadow = !isIn(x + 1, y + 1);
          g.fillStyle = t > 0.22 ? shade(color, 0.35) : t < -0.18 || edgeShadow ? shade(color, -0.25) : color;
        } else if (outline && (isIn(x - 1, y) || isIn(x + 1, y) || isIn(x, y - 1) || isIn(x, y + 1))) {
          g.fillStyle = outline;
        } else {
          continue;
        }
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    return { canvas: c, mask, N };
  }

  function px(g, x, y, color) {
    g.fillStyle = color;
    g.fillRect(Math.round(x) * PX, Math.round(y) * PX, PX, PX);
  }

  function germFrames(type) {
    const N = Math.max(12, Math.round((type.size * 2.6) / PX));
    const c = (N - 1) / 2;
    const R = N * 0.3;
    return [0, 1].map((frame) => {
      let inside;
      let face = { x: c, y: c, r: R };
      if (type.shape === 'virus') {
        const spikes = 8;
        const rot = frame * (Math.PI / spikes);
        inside = (x, y) => {
          const dx = x - c;
          const dy = y - c;
          const d = Math.hypot(dx, dy);
          if (d <= R) return true;
          if (d > R + N * 0.17) return false;
          const a = Math.atan2(dy, dx) - rot;
          const nearest = Math.round(a / ((Math.PI * 2) / spikes)) * ((Math.PI * 2) / spikes);
          const off = Math.abs(Math.sin(a - nearest)) * d;
          return off < (d > R + N * 0.12 ? 1.4 : 0.9);
        };
      } else if (type.shape === 'bacteria') {
        const half = N * 0.26;
        const thick = N * 0.2;
        const wiggle = frame ? 1 : -1;
        inside = (x, y) => {
          const dx = Math.max(Math.abs(x - c) - half, 0);
          if (Math.hypot(dx, y - c) <= thick) return true;
          // Flagellum trailing to the right
          const fx = x - (c + half + thick);
          return fx > 0 && fx < N * 0.22 && Math.abs(y - (c + Math.sin(fx * 0.9) * wiggle * 1.5)) < 0.6;
        };
        face = { x: c - half * 0.4, y: c, r: thick * 1.4 };
      } else if (type.shape === 'worm') {
        const segs = 5;
        inside = (x, y) => {
          for (let i = 0; i < segs; i++) {
            const sx = c - N * 0.3 + i * N * 0.15;
            const sy = c + Math.sin(i * 1.3 + frame * Math.PI) * N * 0.06;
            const r = N * (0.17 - Math.abs(i - (segs - 1)) * 0.012);
            if (Math.hypot(x - sx, y - sy) <= r) return true;
          }
          return false;
        };
        face = { x: c + N * 0.3, y: c + Math.sin(4 * 1.3 + frame * Math.PI) * N * 0.06, r: N * 0.16 };
      } else {
        // fungus: cluster of lumps that breathe
        const lumps = [[0, 0, 0.27], [-0.17, -0.12, 0.17], [0.17, -0.12, 0.17], [-0.2, 0.12, 0.15], [0.2, 0.12, 0.15], [0, -0.24, 0.13]];
        const k = frame ? 1.06 : 1;
        inside = (x, y) => lumps.some(([ox, oy, r]) => Math.hypot(x - (c + ox * N), y - (c + oy * N)) <= r * N * k);
      }
      const { canvas } = blob(N, inside, type.color);
      const g = canvas.getContext('2d');

      // Angry face
      const ex = Math.max(1.2, face.r * 0.42);
      const ey = face.y - face.r * 0.15;
      for (const side of [-1, 1]) {
        const x = face.x + side * ex;
        px(g, x, ey, '#ffffff');
        px(g, x, ey + 1, '#1a1a1a');
        px(g, x - side, ey - 2, '#1a1a1a'); // brow, slanted toward the middle
        px(g, x, ey - 1, '#1a1a1a');
      }
      const my = face.y + face.r * 0.45;
      px(g, face.x - 1, my + 1, '#1a1a1a');
      px(g, face.x, my, '#1a1a1a');
      px(g, face.x + 1, my + 1, '#1a1a1a');

      if (type.boss) {
        // Crown
        const top = Math.max(0, Math.round(face.y - face.r - 4));
        for (let x = -3; x <= 3; x++) px(g, face.x + x, top + 2, '#f1c40f');
        for (const x of [-3, 0, 3]) {
          px(g, face.x + x, top + 1, '#f1c40f');
          px(g, face.x + x, top, '#f1c40f');
        }
        px(g, face.x, top + 2, '#e74c3c');
      }
      return canvas;
    });
  }

  function treeSprite(seed) {
    const N = 20;
    const rnd = seededRandom(seed);
    const lumps = Array.from({ length: 5 }, () => [rnd() * 6 - 3, rnd() * 4 - 4, 4 + rnd() * 2]);
    const { canvas } = blob(N, (x, y) => {
      if (y > 13 && y < 19 && x >= 8 && x <= 11) return false;
      return lumps.some(([ox, oy, r]) => Math.hypot(x - (10 + ox), y - (8 + oy)) <= r) || Math.hypot(x - 10, y - 8) <= 6;
    }, '#3f8f3a');
    const g = canvas.getContext('2d');
    for (let y = 14; y < 19; y++) {
      for (let x = 8; x <= 11; x++) px(g, x, y, x === 8 || x === 11 ? '#3b2412' : x === 9 ? '#8a5a30' : '#6e4422');
    }
    return canvas;
  }

  // ---------- tiles ----------
  function tile(base, draw) {
    const c = makeCanvas(TILE, TILE);
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, TILE, TILE);
    draw?.((x, y, color) => px(g, x, y, color), g);
    return c;
  }

  function speckle(rnd, put, colors, count) {
    for (let i = 0; i < count; i++) put(Math.floor(rnd() * 16), Math.floor(rnd() * 16), colors[i % colors.length]);
  }

  function makeTiles() {
    const T = {};
    const variants = (name, n, fn) => {
      T[name] = Array.from({ length: n }, (_, i) => fn(seededRandom(name.length * 97 + i * 31 + 7)));
    };
    variants('grass', 4, (rnd) => tile('#5aa83c', (put) => {
      speckle(rnd, put, ['#4e9634', '#69b84a', '#4e9634'], 22);
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(rnd() * 14) + 1;
        const y = Math.floor(rnd() * 13) + 2;
        put(x, y, '#3f7f2a');
        put(x + 1, y - 1, '#3f7f2a');
        put(x - 1, y - 1, '#3f7f2a');
      }
    }));
    variants('flowers', 3, (rnd) => tile('#5aa83c', (put) => {
      speckle(rnd, put, ['#4e9634', '#69b84a'], 14);
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(rnd() * 12) + 2;
        const y = Math.floor(rnd() * 12) + 2;
        const petal = ['#ffffff', '#ffd166', '#ff8fab'][i % 3];
        put(x - 1, y, petal);
        put(x + 1, y, petal);
        put(x, y - 1, petal);
        put(x, y + 1, petal);
        put(x, y, '#f5a623');
      }
    }));
    variants('plaza', 2, (rnd) => tile('#dcd6c8', (put) => {
      for (let i = 0; i < 16; i++) {
        put(i, 0, '#c4beb0');
        put(0, i, '#c4beb0');
        put(i, 8, '#c9c3b5');
        put(8, i, '#c9c3b5');
      }
      speckle(rnd, put, ['#e8e3d7', '#cfc9bb'], 10);
    }));
    variants('lair', 3, (rnd) => tile('#4a2a3a', (put) => speckle(rnd, put, ['#5a3448', '#3b2030', '#6b2b45'], 26)));
    variants('gum', 4, (rnd) => tile('#ec98aa', (put) => {
      speckle(rnd, put, ['#e2879b', '#f4aebd', '#d97a90'], 26);
    }));
    variants('plaque', 2, (rnd) => tile('#ec98aa', (put) => {
      speckle(rnd, put, ['#e2879b', '#f4aebd'], 14);
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(rnd() * 12) + 2;
        const y = Math.floor(rnd() * 12) + 2;
        put(x, y, '#fff7e0');
        put(x + 1, y, '#f3e7c4');
        put(x, y + 1, '#f3e7c4');
      }
    }));
    variants('gut', 4, (rnd) => tile('#e3a961', (put) => {
      speckle(rnd, put, ['#d4954d', '#efbd7d'], 18);
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(rnd() * 13) + 1;
        const y = Math.floor(rnd() * 12) + 3;
        put(x, y, '#c98440');
        put(x, y - 1, '#f2c68b');
        put(x, y - 2, '#f2c68b');
      }
    }));
    variants('lung', 4, (rnd) => tile('#f2aab8', (put) => {
      speckle(rnd, put, ['#e999a9', '#f7c2cc'], 16);
      const x = Math.floor(rnd() * 10) + 3;
      const y = Math.floor(rnd() * 10) + 3;
      for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]]) put(x + dx, y + dy, '#fbd3da');
      put(x - 1, y - 1, '#ffffff');
    }));
    variants('clinic', 2, (rnd) => tile('#eef7f6', (put) => {
      for (let i = 0; i < 16; i++) {
        put(i, 0, '#d5e9e6');
        put(0, i, '#d5e9e6');
      }
      speckle(rnd, put, ['#e2f0ee'], 6);
    }));
    return T;
  }

  const ZONE_GROUND = {
    hospital: ['grass', 'grass', 'grass', 'grass', 'grass', 'flowers'],
    mouth: ['gum', 'gum', 'gum', 'plaque'],
    gut: ['gut'],
    lung: ['lung'],
  };

  // ---------- buildings & props ----------
  function hospitalSprite() {
    const W = 72;
    const H = 46;
    const c = makeCanvas(W * PX, H * PX);
    const g = c.getContext('2d');
    const rect = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(x * PX, y * PX, w * PX, h * PX);
    };
    rect(2, 10, 68, 36, '#2b1d1a'); // outline
    rect(3, 11, 66, 34, '#f4f1ea'); // walls
    rect(3, 40, 66, 5, '#d8d2c4'); // base
    rect(0, 4, 72, 8, '#2b1d1a'); // roof outline
    rect(1, 5, 70, 6, '#c0392b');
    for (let x = 1; x < 71; x += 4) rect(x, 9, 2, 2, '#a93226');
    // Sign: red cross on a white plate
    rect(28, 0, 16, 14, '#2b1d1a');
    rect(29, 1, 14, 12, '#ffffff');
    rect(34, 2, 4, 10, '#e5484d');
    rect(31, 5, 10, 4, '#e5484d');
    // Windows
    for (const wy of [16, 27]) {
      for (const wx of [7, 17, 49, 59]) {
        rect(wx - 1, wy - 1, 8, 8, '#2b1d1a');
        rect(wx, wy, 6, 6, '#7fc8f8');
        rect(wx, wy, 2, 2, '#d6f0ff');
        rect(wx + 3, wy, 1, 6, '#2b1d1a');
      }
    }
    // Door
    rect(29, 27, 14, 18, '#2b1d1a');
    rect(30, 28, 12, 17, '#5d8aa8');
    rect(35, 28, 2, 17, '#2b1d1a');
    rect(31, 29, 3, 6, '#9fd0ff');
    rect(38, 29, 3, 6, '#9fd0ff');
    return c;
  }

  // Magic circle on the ground: outer ring, a spinning dashed inner ring and a glowing core
  function portalFrames() {
    const W = 24;
    const H = 14;
    const cx = (W - 1) / 2;
    const cy = (H - 1) / 2;
    return [0, 1, 2, 3].map((frame) => {
      const c = makeCanvas(W * PX, H * PX);
      const g = c.getContext('2d');
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / (W / 2);
          const dy = (y - cy) / (H / 2);
          const d = Math.hypot(dx, dy);
          const a = Math.atan2(dy, dx);
          let color = null;
          if (d > 0.84 && d <= 1) color = '#4b36c9';
          else if (d > 0.72 && d <= 0.84) color = '#b9a8ff';
          else if (d > 0.48 && d <= 0.6 && Math.sin(a * 4 + frame * (Math.PI / 2)) > -0.2) color = '#8f7bff';
          else if (d <= 0.3) color = frame % 2 ? '#ffffff' : '#e3dcff';
          else if (d <= 0.72) color = 'rgba(123, 97, 255, 0.35)';
          if (color) px(g, x, y, color);
        }
      }
      // Sparkles rising from the circle
      for (let i = 0; i < 3; i++) {
        const sx = Math.round(cx + Math.cos(i * 2.1 + frame) * 7);
        px(g, sx, Math.round(cy - 2 - ((frame + i) % 4)), '#ffffff');
      }
      return c;
    });
  }

  function shadowSprite(w) {
    const N = w;
    const c = makeCanvas(N * PX, 4 * PX);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < N; x++) {
        const nx = (x - (N - 1) / 2) / (N / 2);
        const ny = (y - 1.5) / 2;
        if (nx * nx + ny * ny <= 1) g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    return c;
  }

  // ---------- build everything ----------
  function build({ CLASSES, GERMS, NPCS }) {
    const characters = {};
    for (const id of [...Object.keys(CLASSES), ...Object.keys(NPCS)]) characters[id] = characterFrames(id);
    const germs = {};
    for (const [id, type] of Object.entries(GERMS)) germs[id] = germFrames(type);
    return {
      PX, TILE, hash, characters, germs,
      tiles: makeTiles(), zoneGround: ZONE_GROUND,
      trees: [11, 23, 37].map(treeSprite),
      hospital: hospitalSprite(),
      portal: portalFrames(),
      shadow: { small: shadowSprite(10), big: shadowSprite(24) },
    };
  }

  root.Sprites = { build };
})(this);
