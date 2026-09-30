"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
  "pageshow temprano queda diferido cuando bootstrap no sembró estado",
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
    assert.equal(h.controller.inspect().pending, true);
    assert.ok(h.controller.inspect().timerAt !== null);

    await h.advance(3000);

    assert.equal(count(h, "canonical"), 1);
    assert.equal(count(h, "products"), 1);
  }
);

test(
  "focus temprano queda diferido si bootstrap todavía no publicó estado",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("focus");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);
    assert.equal(h.controller.inspect().pending, true);
    assert.ok(h.controller.inspect().timerAt !== null);

    await h.advance(3000);

    assert.equal(count(h, "canonical"), 1);
    assert.equal(count(h, "products"), 1);
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


test(
  "low-cost startup: un backend que tarda en despertar no debe dejar la apertura sin reconciliar",
  async () => {
    const h = harness();
    let releaseCanonical;
    let releaseProducts;

    const delayedCanonical = new Promise(resolve => {
      releaseCanonical = resolve;
    });
    const delayedProducts = new Promise(resolve => {
      releaseProducts = resolve;
    });

    // Sustituimos temporalmente los fetchers mediante un controlador nuevo
    // para simular un cold start del backend que tarda varios segundos.
    let now = 1_000_000;
    let id = 0;
    const timers = new Map();
    const calls = [];
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
      isVisible: () => true,
      isOnline: () => true,
      fetchCanonical: async identity => {
        calls.push(["canonical", identity]);
        return delayedCanonical;
      },
      fetchProducts: async identity => {
        calls.push(["products", identity]);
        return delayedProducts;
      },
      publishCanonical: state => state,
      publishProducts: state => state,
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

    controller.start({
      initial: false,
      deferInitialPassive: false
    });

    // Simula reapertura; el backend todavía está despertando.
    controller.onResume("pageshow");
    await advance(3001);

    // En el diseño deseado debería existir una request viva o programada.
    assert.ok(
      calls.length > 0 || controller.inspect().timerAt !== null,
      "la reapertura quedó sin ningún intento de reconciliación mientras backend despertaba"
    );

    releaseCanonical({
      userId: "A",
      currentDay: 3,
      cycle: 1,
      nextUnlockAt: null
    });
    releaseProducts({
      userId: "A",
      routines: {}
    });
    await flush();
  }
);

test(
  "low-cost startup: un timeout inicial debe reintentarse sin intervención del usuario",
  async () => {
    let now = 1_000_000;
    let id = 0;
    const timers = new Map();
    let canonicalCalls = 0;
    let productCalls = 0;

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
      isVisible: () => true,
      isOnline: () => true,
      requestTimeoutMs: 1000,
      fetchCanonical: async identity => {
        canonicalCalls += 1;

        if (canonicalCalls === 1) {
          return new Promise(() => {});
        }

        return {
          userId: identity,
          currentDay: 3,
          cycle: 1,
          nextUnlockAt: null
        };
      },
      fetchProducts: async identity => {
        productCalls += 1;

        if (productCalls === 1) {
          return new Promise(() => {});
        }

        return {
          userId: identity,
          routines: {}
        };
      },
      publishCanonical: state => state,
      publishProducts: state => state,
      onStatus() {},
      warn() {},
      jitter: () => 0
    });

    async function flush() {
      for (let i = 0; i < 10; i++) {
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

    controller.start({
      initial: false,
      deferInitialPassive: false
    });

    controller.onResume("pageshow");
    await advance(3001);

    // Contrato deseado: la primera tentativa puede fallar/timeout,
    // pero la misma apertura debe reintentar automáticamente.
    await advance(5000);

    assert.ok(
      canonicalCalls >= 2,
      "no hubo segundo intento canónico después del timeout inicial"
    );
    assert.ok(
      productCalls >= 2,
      "no hubo segundo intento de productos después del timeout inicial"
    );
  }
);


test(
  "si bootstrap falla, la misma apertura conserva una reconciliación pendiente",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    assert.equal(count(h, "canonical"), 0);
    assert.equal(h.controller.inspect().pending, true);
    assert.ok(h.controller.inspect().timerAt !== null);

    await h.advance(8000);

    assert.ok(count(h, "canonical") >= 1);
    assert.ok(count(h, "products") >= 1);
  }
);

test(
  "low-cost startup: una app visible debe recuperar dentro de la misma apertura aunque no haya segundo evento",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    // Contrato deseado: sin polling permanente, pero sí debe existir
    // un intento acotado de recuperación durante esta apertura.
    await h.advance(10_000);

    assert.ok(
      count(h, "canonical") >= 1,
      "la app quedó visible 10 s y nunca consultó el estado canónico"
    );
    assert.ok(
      count(h, "products") >= 1,
      "la app quedó visible 10 s y nunca consultó las rutinas de producto"
    );
  }
);

test(
  "evento temprano sin bootstrap deja trabajo pendiente y timer acotado",
  async () => {
    const h = harness();

    h.controller.start({
      initial: false,
      deferInitialPassive: false
    });

    h.controller.onResume("pageshow");
    await h.flush();

    const snapshot = h.controller.inspect();

    assert.equal(snapshot.pending, true);
    assert.equal(snapshot.running, false);
    assert.equal(snapshot.exhausted, false);
    assert.equal(snapshot.retryAt, null);
    assert.equal(snapshot.dueAt, null);
    assert.ok(snapshot.timerAt !== null);
  }
);


test(
  "backend-client fuerza reconciliación si falla bootstrap general",
  () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "backend-client.js"),
      "utf8"
    );

    assert.match(
      source,
      /refreshActiveState\(\s*"bootstrap-failed",\s*\{ force: true \}\s*\)/
    );
  }
);

test(
  "backend-client fuerza reconciliación si falla bootstrap de productos",
  () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "backend-client.js"),
      "utf8"
    );

    assert.match(
      source,
      /refreshActiveState\(\s*"product-bootstrap-failed",\s*\{ force: true \}\s*\)/
    );
  }
);
