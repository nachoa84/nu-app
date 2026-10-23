"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "supplements-view.js"), "utf8");

function completionFor(day, currentDay, backend = null) {
  const cards = [];
  const calls = [];
  const context = {
    document: { getElementById: () => null, createElement: () => {
      const classes = new Set();
      const card = { classList: { add: name => classes.add(name), contains: name => classes.has(name) },
        isConnected: true, setAttribute() {}, append(...children) { this.children = children; },
        appendChild(child) { this.children = [child]; } };
      cards.push(card);
      return card;
    } },
    window: { addEventListener() {}, BackendAPI: backend },
    createUpcomingPharmanexCardV123() {},
    getActiveRoutineId: () => "lifepak-elements-5",
    getActiveRoutineConfig: () => ({ totalDays: 5 }),
    getRoutineProfile: () => ({ userId: "reviewer" }),
    getRoutineState: () => ({ currentDay }),
    isDayComplete: () => false,
    isPreviewMode: true,
    ICONS: { check: "✓" },
    renderSupplements: () => calls.push("supplements"),
    renderDays: () => calls.push("days"),
    selectedDay: day
  };
  vm.runInNewContext(source + "\nglobalThis.result = createSupplementCompletion();", context);
  return { card: context.result, cards, calls };
}

test("preview exposes future supplement material without recording completion", () => {
  const { card, cards } = completionFor(4, 1);
  assert.match(card.innerHTML, /Vista previa del día/);
  assert.match(card.innerHTML, /Podés recorrer estos materiales/);
  assert.equal(card.className, "supplement-preview-card");
  assert.equal(cards.length, 1, "future day has no completion button");
});

test("selecting a calendar day opens its detail in the same turn", () => {
  const events = [];
  const context = vm.createContext({
    days: { 4: { blocks: [] } },
    isPreviewMode: true,
    selectedDay: 1,
    chat: { innerHTML: "", className: "" },
    revealIndex: 0,
    setTimeout: () => { throw new Error("Delayed day opening exposes the home screen"); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "daily-view.js"), "utf8"), context);
  context.renderSelectedDayHeader = () => events.push("header");
  context.activateMainView = (view, options) => {
    assert.equal(view, "hoy");
    assert.equal(options.animate, false);
    events.push("view");
  };
  context.renderStructuredDayDetail = () => events.push("content");
  context.openNativeDayView = () => events.push("day");
  vm.runInContext("selectDay(4, true); globalThis.openedDay = selectedDay", context);
  assert.equal(context.openedDay, 4);
  assert.deepEqual(events, ["header", "view", "content", "day"]);
});

test("the current supplement day still offers the completion control", () => {
  const { card, cards } = completionFor(1, 1);
  assert.equal(cards.length, 4);
  assert.equal(cards[1].textContent, "Marcar como hecho");
  assert.equal(card.children[0], cards[3]);
  assert.equal(cards[3].children[0], cards[1]);
});

test("confirmed supplement completion shows the native visible done state", async () => {
  const backend = { completeProductRoutineDay: async () => ({
    userId: "reviewer", routines: { "lifepak-elements-5": { completedDays: [1] } }
  }) };
  const { card, cards, calls } = completionFor(1, 1, backend);
  await cards[1].onclick();
  assert.equal(card.classList.contains("done"), true);
  assert.match(card.innerHTML, /complete-done-copy/);
  assert.match(card.innerHTML, /Día completado/);
  assert.deepEqual(calls, ["days"]);
  const css = fs.readFileSync(path.join(__dirname, "..", "supplements.css"), "utf8");
  assert.match(css, /supplement-completion-action/);
  assert.doesNotMatch(css, /!important/);
});

test("a rejected routine leaves the button enabled and shows a visible error", async () => {
  const backend = { completeProductRoutineDay: async () => {
    throw new Error("Rutina no válida.");
  } };
  const { card, cards } = completionFor(1, 1, backend);
  await cards[1].onclick();
  assert.equal(cards[1].disabled, false);
  assert.equal(cards[2].className, "supplement-completion-feedback");
  assert.match(cards[2].textContent, /Reiniciá Nu App/);
  assert.equal(card.classList.contains("done"), false);
  const css = fs.readFileSync(path.join(__dirname, "..", "supplements.css"), "utf8");
  assert.match(css, /\.supplement-completion-feedback\s*\{\s*display: block;/);
});
