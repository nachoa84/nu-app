"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
);

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);

  assert.notEqual(start, -1, `No se encontró ${startMarker}`);
  assert.notEqual(end, -1, `No se encontró ${endMarker}`);

  return source.slice(start, end);
}

const collagenTransition = section(
  "async function advanceIfEligible(",
  "async function getState("
);

const productTransition = section(
  "async function advanceProductRoutinesIfEligible(",
  "async function recalculateProductRoutinePendingUnlock("
);

test("Collagen bloquea el avance si el día actual no tiene completado oficial", () => {
  assert.match(collagenTransition, /FROM day_progress AS progress/);
  assert.match(collagenTransition, /progress\.user_id = user_row\.id/);
  assert.match(collagenTransition, /progress\.cycle = user_row\.cycle/);
  assert.match(collagenTransition, /progress\.day = user_row\.current_day/);
  assert.match(collagenTransition, /progress\.completed_at IS NOT NULL/);
  assert.match(collagenTransition, /user\.current_day_completed === true/);
});

test("Collagen usa el horario de PostgreSQL y conserva el lock de la fila", () => {
  assert.match(
    collagenTransition,
    /user_row\.next_unlock_at <= NOW\(\)/
  );
  assert.match(collagenTransition, /user\.unlock_due === true/);
  assert.match(collagenTransition, /FOR UPDATE OF user_row/);
  assert.doesNotMatch(
    collagenTransition,
    /next_unlock_at[\s\S]{0,160}Date\.now\(\)/
  );
});

test("Collagen sigue avanzando como máximo un día y mantiene la cola idempotente", () => {
  assert.match(
    collagenTransition,
    /Number\(user\.current_day\) \+ 1/
  );
  assert.match(collagenTransition, /INSERT INTO notification_jobs/);
  assert.match(
    collagenTransition,
    /ON CONFLICT \([\s\S]*user_id,[\s\S]*cycle,[\s\S]*day,[\s\S]*kind[\s\S]*\)[\s\S]*DO NOTHING/
  );
});

test("rutinas de producto exigen completado oficial del mismo usuario, rutina y día", () => {
  assert.match(
    productTransition,
    /FROM product_routine_day_progress AS progress/
  );
  assert.match(
    productTransition,
    /progress\.user_id = state\.user_id/
  );
  assert.match(
    productTransition,
    /progress\.routine_id = state\.routine_id/
  );
  assert.match(
    productTransition,
    /progress\.day = state\.current_day/
  );
  assert.match(
    productTransition,
    /progress\.completed_at IS NOT NULL/
  );
});

test("rutinas de producto conservan DB time, lock, avance de un día e idempotencia", () => {
  assert.match(
    productTransition,
    /state\.next_unlock_at <= NOW\(\)/
  );
  assert.match(productTransition, /FOR UPDATE/);
  assert.match(
    productTransition,
    /LEAST\(state\.current_day \+ 1, 10\)/
  );
  assert.match(
    productTransition,
    /INSERT INTO routine_notification_jobs/
  );
  assert.match(productTransition, /DO NOTHING/);
});
