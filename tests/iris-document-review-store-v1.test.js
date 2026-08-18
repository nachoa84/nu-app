"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  IrisDocumentTransitionErrorV1,
  IrisDocumentTransitionOperationalErrorV1,
  createIrisDocumentReviewStoreV1,
  safeTransitionLogV1
} = require("../iris-document-review-store-v1");

function documentV1(overrides = {}) {
  return {
    id: 41,
    document_family_key: "family_collagen",
    authorization_status: "pending",
    authorization_reference: "authorized-reference",
    language: "es",
    country: "US",
    is_active: false,
    retired_at: null,
    ...overrides
  };
}

function harnessV1({
  document = documentV1(),
  repeated = false,
  activeConflict = false,
  failOn = null,
  logError = () => {}
} = {}) {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (failOn && failOn.test(text)) {
        throw Object.assign(new Error("detalle privado"), {
          code: "40001",
          constraint: "safe_constraint"
        });
      }
      if (/FROM iris_documents\n\s+WHERE document_key/.test(text)) {
        return { rows: document ? [document] : [] };
      }
      if (/details ->> 'decision'/.test(text)) {
        return { rows: repeated ? [{ exists: 1 }] : [] };
      }
      if (/id <> \$4/.test(text)) {
        return { rows: activeConflict ? [{ exists: 1 }] : [] };
      }
      return { rows: [] };
    },
    release() {
      calls.push({ text: "RELEASE" });
    }
  };
  const pool = {
    async connect() {
      calls.push({ text: "CONNECT" });
      return client;
    }
  };

  return {
    calls,
    client,
    store: createIrisDocumentReviewStoreV1({ pool, logError })
  };
}

function requestV1(overrides = {}) {
  return {
    documentKey: "doc_document-id",
    operation: "review",
    actorKeyId: "nuapp-iris-admin-v1",
    now: "2026-08-18T18:00:00.000Z",
    ...overrides
  };
}

test("requiere un pool PostgreSQL válido", () => {
  assert.throws(
    () => createIrisDocumentReviewStoreV1({}),
    IrisDocumentTransitionErrorV1
  );
});

test("rechaza entradas inválidas antes de abrir conexión", async () => {
  const h = harnessV1();
  for (const request of [
    requestV1({ documentKey: "../escape" }),
    requestV1({ operation: "delete" }),
    requestV1({ actorKeyId: "" }),
    requestV1({ now: "fecha-inválida" })
  ]) {
    await assert.rejects(
      h.store.transitionDocument(request),
      IrisDocumentTransitionErrorV1
    );
  }
  assert.equal(h.calls.length, 0);
});

test("revisa sin cambiar estado y audita dentro de la transacción", async () => {
  const h = harnessV1();
  const result = await h.store.transitionDocument(requestV1());

  assert.deepEqual(result, {
    authorizationStatus: "pending",
    isActive: false,
    retired: false
  });
  const sql = h.calls.map(call => call.text);
  assert.ok(sql.includes("BEGIN"));
  assert.ok(sql.some(text => /FOR UPDATE/.test(text)));
  assert.ok(!sql.some(text => /UPDATE iris_documents/.test(text)));
  assert.ok(sql.some(text => /INSERT INTO iris_document_audit/.test(text)));
  assert.ok(sql.includes("COMMIT"));
  assert.ok(sql.includes("RELEASE"));

  const audit = h.calls.find(call =>
    /INSERT INTO iris_document_audit/.test(call.text)
  );
  assert.deepEqual(audit.values, [
    41,
    "nuapp-iris-admin-v1",
    "document_reviewed",
    '{"decision":"reviewed"}'
  ]);
  assert.ok(!h.calls.some(call =>
    call.text.includes("doc_document-id")
  ));
  assert.ok(h.calls.some(call =>
    call.values?.includes("doc_document-id")
  ));
});

test("aprueba sin activar y registra la decisión mínima", async () => {
  const h = harnessV1();
  const result = await h.store.transitionDocument(
    requestV1({ operation: "approve" })
  );

  assert.deepEqual(result, {
    authorizationStatus: "approved",
    isActive: false,
    retired: false
  });
  const update = h.calls.find(call =>
    /SET authorization_status = 'approved'/.test(call.text)
  );
  assert.deepEqual(update.values, [
    41,
    new Date("2026-08-18T18:00:00.000Z")
  ]);
  const audit = h.calls.find(call =>
    /INSERT INTO iris_document_audit/.test(call.text)
  );
  assert.equal(audit.values[2], "document_reviewed");
  assert.equal(audit.values[3], '{"decision":"approved"}');
});

test("activa solo un documento aprobado y bloquea su alcance", async () => {
  const h = harnessV1({
    document: documentV1({ authorization_status: "approved" })
  });
  const result = await h.store.transitionDocument(
    requestV1({ operation: "activate" })
  );

  assert.deepEqual(result, {
    authorizationStatus: "approved",
    isActive: true,
    retired: false
  });
  assert.ok(h.calls.some(call =>
    /pg_advisory_xact_lock/.test(call.text)
  ));
  assert.ok(h.calls.some(call =>
    /AND id <> \$4/.test(call.text)
  ));
  assert.ok(h.calls.some(call =>
    /SET is_active = TRUE/.test(call.text)
  ));
  const audit = h.calls.find(call =>
    /INSERT INTO iris_document_audit/.test(call.text)
  );
  assert.equal(audit.values[2], "document_activated");
});

test("rechaza estados inválidos y repeticiones con ROLLBACK", async () => {
  const cases = [
    { request: requestV1({ operation: "activate" }) },
    {
      document: documentV1({ authorization_status: "approved" }),
      request: requestV1({ operation: "reject" })
    },
    {
      document: documentV1({ retired_at: new Date() }),
      request: requestV1({ operation: "review" })
    },
    { repeated: true, request: requestV1() }
  ];

  for (const item of cases) {
    const h = harnessV1(item);
    await assert.rejects(
      h.store.transitionDocument(item.request),
      IrisDocumentTransitionErrorV1
    );
    assert.ok(h.calls.some(call => call.text === "ROLLBACK"));
    assert.ok(!h.calls.some(call => call.text === "COMMIT"));
  }
});

test("un conflicto activo no reemplaza ni retira otra versión", async () => {
  const h = harnessV1({
    document: documentV1({ authorization_status: "approved" }),
    activeConflict: true
  });
  await assert.rejects(
    h.store.transitionDocument(
      requestV1({ operation: "activate" })
    ),
    /Ya existe una versión activa/
  );
  assert.ok(!h.calls.some(call =>
    /SET is_active = TRUE/.test(call.text)
  ));
  assert.ok(h.calls.some(call => call.text === "ROLLBACK"));
});

test("rechaza y retira lógicamente sin borrar filas", async () => {
  const rejected = harnessV1();
  const rejectResult = await rejected.store.transitionDocument(
    requestV1({ operation: "reject" })
  );
  assert.equal(rejectResult.authorizationStatus, "rejected");
  assert.ok(rejected.calls.some(call =>
    /SET authorization_status = 'rejected'/.test(call.text)
  ));

  const retired = harnessV1({
    document: documentV1({
      authorization_status: "approved",
      is_active: true
    })
  });
  const retireResult = await retired.store.transitionDocument(
    requestV1({ operation: "retire" })
  );
  assert.deepEqual(retireResult, {
    authorizationStatus: "approved",
    isActive: false,
    retired: true
  });
  assert.ok(retired.calls.some(call =>
    /retired_at = \$2/.test(call.text)
  ));
  for (const h of [rejected, retired]) {
    assert.ok(!h.calls.some(call =>
      /\bDELETE\b|\bTRUNCATE\b|\bDROP\b/.test(call.text)
    ));
  }
});

test("un fallo de auditoría revierte la actualización y se sanea", async () => {
  const logs = [];
  const h = harnessV1({
    failOn: /INSERT INTO iris_document_audit/,
    logError: entry => logs.push(entry)
  });

  await assert.rejects(
    h.store.transitionDocument(
      requestV1({ operation: "approve" })
    ),
    IrisDocumentTransitionOperationalErrorV1
  );
  assert.ok(h.calls.some(call =>
    /SET authorization_status = 'approved'/.test(call.text)
  ));
  assert.ok(h.calls.some(call => call.text === "ROLLBACK"));
  assert.ok(!h.calls.some(call => call.text === "COMMIT"));
  assert.deepEqual(logs, [{
    operation: "transition_iris_document_v1",
    errorCode: "40001",
    constraint: "safe_constraint",
    retryable: true
  }]);
  assert.ok(!JSON.stringify(logs).includes("privado"));
});

test("el fallo al liberar después de COMMIT no cambia el resultado", async () => {
  const logs = [];
  const h = harnessV1({ logError: entry => logs.push(entry) });
  h.client.release = () => {
    throw Object.assign(new Error("detalle privado"), {
      code: "08006"
    });
  };

  const result = await h.store.transitionDocument(requestV1());
  assert.equal(result.authorizationStatus, "pending");
  assert.deepEqual(logs, [{
    operation: "release_database_client_v1",
    errorCode: "08006",
    constraint: "",
    retryable: true
  }]);
});

test("clasifica errores operativos sin revelar el error original", () => {
  assert.deepEqual(
    safeTransitionLogV1({
      code: "40P01",
      constraint: "safe_constraint",
      message: "contenido privado"
    }, "operation"),
    {
      operation: "operation",
      errorCode: "40P01",
      constraint: "safe_constraint",
      retryable: true
    }
  );
});
