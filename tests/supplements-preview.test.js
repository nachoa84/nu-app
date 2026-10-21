"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "supplements-view.js"), "utf8");

function completionFor(day, currentDay) {
  const cards = [];
  const context = {
    document: { createElement: () => {
      const card = { classList: { add() {} }, setAttribute() {}, append(...children) { this.children = children; } };
      cards.push(card);
      return card;
    } },
    window: { addEventListener() {} },
    createUpcomingPharmanexCardV123() {},
    getActiveRoutineId: () => "lifepak-elements-5",
    getActiveRoutineConfig: () => ({ totalDays: 5 }),
    getRoutineProfile: () => ({ userId: "reviewer" }),
    getRoutineState: () => ({ currentDay }),
    isDayComplete: () => false,
    isPreviewMode: true,
    selectedDay: day
  };
  vm.runInNewContext(source + "\nglobalThis.result = createSupplementCompletion();", context);
  return { card: context.result, cards };
}

test("preview exposes future supplement material without recording completion", () => {
  const { card, cards } = completionFor(4, 1);
  assert.match(card.innerHTML, /Vista previa del día/);
  assert.match(card.innerHTML, /Podés recorrer estos materiales/);
  assert.equal(cards.length, 1, "future day has no completion button");
});

test("the current supplement day still offers the completion control", () => {
  const { card, cards } = completionFor(1, 1);
  assert.equal(cards.length, 3);
  assert.equal(cards[1].textContent, "Marcar día completado");
  assert.equal(card.children[0], cards[1]);
});
