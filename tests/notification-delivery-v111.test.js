const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachDeliveryIdentityV111,
  classifyPushErrorV111,
  endpointHashV111,
  logicalDeliveryKeyV111,
  retryDelayMsV111,
  summarizeDeliveryRowsV111
} = require("../notification-delivery-v111");

function batch() {
  return {
    userId: "user-v111",
    collagen: [{ id: 9, day: 4 }],
    products: [
      { id: 12, routine_id: "lumispa-10", day: 3 }
    ]
  };
}

test("la clave y el tag son deterministas", () => {
  const first = logicalDeliveryKeyV111(batch());
  const reordered = logicalDeliveryKeyV111({
    ...batch(),
    collagen: [...batch().collagen].reverse(),
    products: [...batch().products].reverse()
  });

  assert.equal(first, reordered);
  assert.equal(first.length, 64);

  const payload = attachDeliveryIdentityV111(
    { title: "Prueba" },
    first
  );
  assert.equal(payload.tag, "routine_" + first);
  assert.equal(payload.notificationId, payload.tag);
});

test("notificaciones distintas no comparten tag", () => {
  const first = logicalDeliveryKeyV111(batch());
  const second = logicalDeliveryKeyV111({
    ...batch(),
    products: [{ id: 13, routine_id: "wellspa-10", day: 2 }]
  });
  assert.notEqual(first, second);
});

test("el endpoint se registra sólo como hash", () => {
  const endpoint = "https://push.example/subscription/secret";
  const hash = endpointHashV111(endpoint);
  assert.equal(hash.length, 64);
  assert.equal(hash.includes("secret"), false);
});

test("clasifica respuestas push", () => {
  assert.equal(classifyPushErrorV111({ statusCode: 410 }).kind, "expired");
  assert.equal(classifyPushErrorV111({ statusCode: 404 }).kind, "expired");
  assert.equal(classifyPushErrorV111({ statusCode: 429 }).kind, "retryable");
  assert.equal(classifyPushErrorV111({ statusCode: 503 }).kind, "retryable");
  assert.equal(classifyPushErrorV111({ statusCode: 401 }).kind, "retryable");
  assert.equal(classifyPushErrorV111({ statusCode: 403 }).kind, "retryable");
  assert.equal(classifyPushErrorV111({ statusCode: 400 }).kind, "permanent");
  assert.equal(classifyPushErrorV111(new Error("network")).kind, "retryable");
});

test("el backoff crece y queda acotado", () => {
  assert.equal(retryDelayMsV111(1, 60000), 60000);
  assert.equal(retryDelayMsV111(2, 60000), 120000);
  assert.equal(retryDelayMsV111(3, 60000), 240000);
  assert.equal(retryDelayMsV111(99, 60000), 86400000);
});

test("resume éxito parcial sin reabrir enviados", () => {
  const summary = summarizeDeliveryRowsV111([
    { status: "sent" },
    { status: "retryable" },
    { status: "permanent" }
  ]);

  assert.deepEqual(summary, {
    total: 3,
    pending: 0,
    processing: 0,
    retryable: 1,
    sent: 1,
    permanent: 1,
    open: 1
  });
});

test("simula 1000 usuarios sin colisiones de claves", () => {
  const keys = new Set();

  for (let index = 1; index <= 1000; index++) {
    keys.add(logicalDeliveryKeyV111({
      userId: "load-v111-" + index,
      collagen: [{ id: index, day: 2 }],
      products: []
    }));
  }

  assert.equal(keys.size, 1000);
});

test("requiere por lo menos un trabajo fuente", () => {
  assert.throws(
    () => logicalDeliveryKeyV111({
      userId: "sin-trabajos",
      collagen: [],
      products: []
    }),
    /al menos un trabajo fuente/
  );
});
