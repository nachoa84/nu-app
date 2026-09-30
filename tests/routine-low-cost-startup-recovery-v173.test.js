"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoutineActiveSyncV172 } = require("../routine-active-sync-v172");

function harness() {
  let now = 1_000_000;
  let id = 0;
  let visible = true;
  let online = true;
  const timers = new Map();
  const calls = [];
  const published = [];

  const controller = createRoutineActiveSyncV172({
    now: () => now,
    setTimeout(fn, ms) {
      const key = ++id;
      timers.set(key, { fn, at: now + ms });
      return key;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    getIdentity: () => "A",
    isVisible: () => visible,
    isOnline: () => online,
    fetchCanonical: async identity => {
      calls.push(["canonical", identity]);
      return {
        userId: identity,
        currentDay: 3,
        cycle: 1,
        nextUnlockAt: null,
        completedDays: [1, 2]
      };
    },
    fetchProducts: async identity => {
      calls.push(["products", identity]);
      return {
        userId: identity,
        routines: {
          "lumispa-10": {
            initialized: true,
            currentDay: 4,
            nextUnlockAt: null,
            completedDays: [1, 2, 3]
          }
        }
      };
    },
    publishCanonical: state => {
      published.push(["canonical", state]);
      return state;
    },
    publishProducts: state => {
      published.push(["products", state]);
      return state;
    },
    onStatus() {},
    warn() {},
    jitter: () => 0
  });

  async function flush() {
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async function advance(ms) {
    const end = now + ms;

    for (let n = 0; n < 1000; n++) {
      const entries = [...timers.entries()]
        .sort((a, b) => a[1].at - b[1].at);

      if (!entries.length || entries[0][1].at > end) break;

      const [key, timer] = entries[0];
      timers.delete(key);
      now = timer.at;
      timer.fn();
      await flush();
    }

    now = end;
    await flush();
  }

  return {
    controller,
    calls,
    published,
    timers,
    advance,
    flush,
    setVisible(value) { visible = value; },
    setOnline(value) { online = value; }
  };
}

function count(h, type) {
  return h.calls.filter(call => call[0] === type).length;
}

test(
  "low-cost startup: una reapertura debe reconciliar aunque bootstrap no haya sembrado estado",
  async () => {
    const h = harness();

    // Producción de bajo costo: no existe polling/cron permanente.
    // El coordinador arranca reutilizando bootstrap, pero simulamos que
    // bootstrap falló o nunca alcanzó a publicar estado canónico.
    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    // En una PWA instalada pageshow puede ser el único evento temprano
    // observable antes de que el usuario empiece a interactuar.
    h.controller.onResume("pageshow");
    await h.advance(3000);

    // Contrato requerido: abrir la app debe bastar para despertar backend
    // y reconciliar Collagen + productos sin exigir cerrar/reabrir otra vez.
    assert.equal(count(h, "canonical"), 1);
    assert.equal(count(h, "products"), 1);
    assert.equal(
      h.published.some(([type, state]) =>
        type === "canonical" && state.currentDay === 3
      ),
      true
    );
  }
);

test(
  "low-cost startup: volver online debe recuperar aun sin estado due cacheado",
  async () => {
    const h = harness();

    h.setOnline(false);
    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    // Bootstrap habría fallado por falta de red y V172 no conoce nextUnlockAt.
    h.controller.onResume("pageshow");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);

    // Cuando regresa la conectividad, la recuperación debe ser explícita.
    h.setOnline(true);
    h.controller.onResume("online");
    await h.flush();

    assert.equal(count(h, "canonical"), 1);
    assert.equal(count(h, "products"), 1);
  }
);

test(
  "low-cost startup: un estado desconocido no debe quedar indefinidamente sin reconciliar",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    // Sin bootstrap exitoso no hay dueAt conocido.
    assert.equal(h.controller.inspect().dueAt, null);

    // El contrato nuevo exige algún mecanismo acotado de recuperación
    // durante la misma apertura, sin polling permanente.
    await h.advance(5000);

    assert.ok(
      count(h, "canonical") >= 1,
      "la apertura quedó sin ninguna lectura canónica"
    );
  }
);


test(
  "characterization: pageshow temprano se descarta y no deja retry pendiente",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);
    assert.equal(count(h, "products"), 0);
    assert.equal(h.controller.inspect().pending, false);
    assert.equal(h.controller.inspect().timerAt, null);

    // Aunque transcurra mucho más que INITIAL_GRACE_MS, nada vuelve a dispararse.
    await h.advance(60_000);

    assert.equal(count(h, "canonical"), 0);
    assert.equal(count(h, "products"), 0);
  }
);

test(
  "characterization: focus temprano también puede perderse si no hubo bootstrap exitoso",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("focus");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);
    assert.equal(h.controller.inspect().pending, false);
    assert.equal(h.controller.inspect().timerAt, null);

    await h.advance(10_000);

    assert.equal(
      count(h, "canonical"),
      0,
      "el focus temprano debería haber quedado diferido, pero hoy se pierde"
    );
  }
);

test(
  "characterization: un segundo evento después de la gracia sí reconcilia",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);

    await h.advance(3001);

    h.controller.onResume("focus");
    await h.flush();

    assert.equal(count(h, "canonical"), 1);
    assert.equal(count(h, "products"), 1);
  }
);
