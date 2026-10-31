"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "progress-view.js"), "utf8");
const { isReviewModeAllowed } = require("../review-mode");

function renderSupplementProgress(completed = []) {
  const elements = [];
  const grid = { append(...children) { this.children = children; } };
  const kicker = {};
  const makeElement = () => {
    const element = {
      style: {},
      classList: { add() {} },
      setAttribute() {},
      append(...children) { this.children = children; },
      appendChild(child) { (this.children ||= []).push(child); },
      querySelector(selector) {
        if (selector === ".app-checkin-btn" && !this.innerHTML?.includes("app-checkin-btn")) return null;
        if (selector === ".app-progress-fill") return { style: {} };
        if (selector === ".app-today-main") return { onclick: null };
        return null;
      }
    };
    elements.push(element);
    return element;
  };
  const context = {
    document: {
      getElementById(id) { return id === "daysGrid" ? grid : id === "routineHeaderKicker" ? kicker : null; },
      createElement: makeElement
    },
    getActiveRoutineConfig: () => ({ title: "Prysm iO", category: "supplements" }),
    getRoutineState: () => ({ currentDay: 1 }),
    isDayComplete: day => completed.includes(day),
    advanceRoutineIfEligible() {},
    prefersReducedMotion: () => true,
    ensureDemoControls() {},
    selectDay() {},
    ICONS: { arrow: "→", lock: "lock", check: "check", checkCircleFilled: "done" },
    TOTAL_PROGRAM_DAYS: 5,
    days: { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} },
    isPreviewMode: false
  };
  vm.runInNewContext(source + "\nrenderDays();", context);
  return { progress: grid.children[0].innerHTML, today: grid.children[1].innerHTML };
}

test("supplement calendar counts confirmed completions and has no optimistic check-in", () => {
  const initial = renderSupplementProgress();
  assert.match(initial.progress, /0 de 5 días completados/);
  assert.match(initial.progress, /Progreso 0%/);
  assert.doesNotMatch(initial.today, /app-checkin-btn/);
  assert.match(initial.today, /Tus materiales del día/);

  const completed = renderSupplementProgress([1]);
  assert.match(completed.progress, /1 de 5 días completados/);
  assert.match(completed.progress, /Progreso 20%/);
});

test("published environments close the day-preview and demo gates", () => {
  assert.equal(isReviewModeAllowed({ REPLIT_DEPLOYMENT: "1", NODE_ENV: "development" }), false);
  assert.equal(isReviewModeAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isReviewModeAllowed({ NODE_ENV: "development" }), true);
});
