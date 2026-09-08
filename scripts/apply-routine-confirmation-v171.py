#!/usr/bin/env python3
"""Apply the V171 shared completion integration to the audited branch.

This script edits only frontend files. It does not run the app, connect to a
DB, publish a deployment, or touch main/development refs.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_BRANCH = "work/routine-confirmation-v171"


def sh(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True).strip()


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


branch = sh("git", "branch", "--show-current")
if branch != EXPECTED_BRANCH:
    raise SystemExit(f"Wrong branch: {branch}")
if sh("git", "status", "--porcelain"):
    raise SystemExit("Working tree must be clean before applying V171")

# routine-state.js: pure local persistence. Network operations become explicit
# callers' responsibility, so canonical-state application cannot emit POSTs.
path = "routine-state.js"
s = read(path)
s = replace_once(s,
'''  const fallback = {\n    currentDay: 1,''',
'''  const fallback = {\n    cycle: 1,\n    currentDay: 1,''',
"routine fallback cycle")
s = replace_once(s,
'''    return resolvePendingUnlockV131({\n      currentDay: Number(saved.currentDay || 1),''',
'''    return resolvePendingUnlockV131({\n      cycle: Number(saved.cycle || 1),\n      currentDay: Number(saved.currentDay || 1),''',
"routine stored cycle")
s = replace_once(s,
'''function saveRoutineState(state) {\n  localStorage.setItem(\n    getRoutineStateStorageKey(),\n    JSON.stringify(state)\n  );\n  if (!isBackendManagedRoutine() && window.BackendAPI) {\n    window.BackendAPI.openProductRoutineDay(getActiveRoutineId(), Number(state.currentDay || 1))\n      .catch(error => console.warn("No se pudo sincronizar la selección de rutina.", error));\n  }\n}''',
'''function saveRoutineState(state) {\n  localStorage.setItem(\n    getRoutineStateStorageKey(),\n    JSON.stringify(state)\n  );\n}''',
"saveRoutineState hidden network")
s = replace_once(s,
'''\n  if (complete && !isBackendManagedRoutine() && window.BackendAPI) {\n    window.BackendAPI.completeProductRoutineDay(getActiveRoutineId(), Number(day))\n      .catch(error => console.warn("No se pudo sincronizar el día completado.", error));\n  }\n}''',
'''\n}''',
"legacy setDayComplete hidden network")
s = replace_once(s,
'''\n  if (complete && window.BackendAPI) {\n    window.BackendAPI\n      .completeProductRoutineDay(routineId, safeDay)\n      .catch(error => console.warn("No se pudo sincronizar el día completado.", error));\n  }\n};''',
'''\n};''',
"V100 setDayComplete hidden network")
write(path, s)

# routine-sync.js: retain the canonical Collagen cycle locally and explicitly
# register product opening when a product state is first selected/current.
path = "routine-sync.js"
s = read(path)
s = replace_once(s,
'''  localState.currentDay =\n    Number(\n      serverState.currentDay ||\n      localState.currentDay ||\n      1\n    );''',
'''  localState.cycle =\n    Number(\n      serverState.cycle ||\n      localState.cycle ||\n      1\n    );\n\n  localState.currentDay =\n    Number(\n      serverState.currentDay ||\n      localState.currentDay ||\n      1\n    );''',
"canonical Collagen cycle")
write(path, s)

# daily-view.js: keep the V170 helpers temporarily for historical regression
# tests, but route every routine's live button through the shared V171 core.
path = "daily-view.js"
s = read(path)
start = s.index('  if (block.type === "complete") {')
end_marker = '\n}\n\nfunction createCompactMediaItem'
end = s.index(end_marker, start)
new_block = r'''  if (block.type === "complete") {
    const card = document.createElement("div");
    card.className = "complete-card";

    const day = Number(selectedDay);
    const routineId = getActiveRoutineId();
    const userId = String(getRoutineProfile()?.userId || "");
    const done = isDayComplete(day);

    const completionStatus = () =>
      window.RoutineCompletionV171?.status(day, routineId) || { phase: "idle" };

    const renderDoneState = ({ animate = false } = {}) => {
      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.removeAttribute("aria-busy");
      card.innerHTML = `
        <div class="complete-done-copy">
          <h3><span class="complete-done-inline-check" aria-hidden="true">${ICONS.check}</span><span>Hecho hoy</span></h3>
          <p>Registrado.</p>
        </div>
      `;
      if (animate) setTimeout(() => card.classList.remove("just-completed"), 620);
    };

    if (done) {
      renderDoneState();
      return card;
    }

    card.innerHTML = `
      <h3>¿Lo hiciste?</h3>
      <p>Registrá tu avance.</p>
    `;

    const btn = document.createElement("button");
    btn.className = "primary complete-day-btn";
    btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Hoy lo hice</span>`;

    const helper = document.createElement("small");
    helper.className = "complete-helper";
    helper.textContent = "Solo registra tu avance";

    const renderPendingState = () => {
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      card.setAttribute("aria-busy", "true");
      btn.textContent = "Guardando...";
      helper.removeAttribute("role");
      helper.textContent = "Estamos confirmando tu avance.";
    };

    const renderRetryState = () => {
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
      card.removeAttribute("aria-busy");
      btn.innerHTML = `<span class="complete-action-check" aria-hidden="true">${ICONS.check}</span><span>Volver a intentar</span>`;
      helper.setAttribute("role", "alert");
      helper.textContent = "No pudimos confirmar el registro. Revisá tu conexión y volvé a intentarlo.";
    };

    btn.onclick = async () => {
      if (!window.RoutineCompletionV171) {
        renderRetryState();
        return;
      }
      if (completionStatus().phase === "pending") return;

      const stillHere = () =>
        getActiveRoutineId() === routineId &&
        String(getRoutineProfile()?.userId || "") === userId;
      const refreshDetached = () => {
        if (Number(selectedDay) === day && !card.isConnected) renderStructuredDayDetail();
      };

      const task = window.RoutineCompletionV171.complete(day, routineId);
      renderPendingState();
      renderDays();

      try {
        await task;
        if (!stillHere()) return;
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        if (navigator.vibrate) navigator.vibrate(12);
        if (isDayComplete(day)) renderDoneState({ animate: true });
        else refreshDetached();
        renderDays();
      } catch (error) {
        console.warn("No se pudo confirmar el completado de la rutina.", error);
        if (!stillHere()) return;
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        renderRetryState();
        renderDays();
      }
    };

    card.append(btn, helper);
    if (completionStatus().phase === "pending") renderPendingState();
    else if (completionStatus().phase === "failed") renderRetryState();
    return card;
  }'''
s = s[:start] + new_block + s[end:]
write(path, s)

# progress-view.js: the calendar uses the same promise/controller as the day
# card. No direct local completion and no direct BackendAPI.completeDay call.
path = "progress-view.js"
s = read(path)
s = replace_once(s,
'''  const currentComplete = isDayComplete(state.currentDay);''',
'''  const currentComplete = isDayComplete(state.currentDay);\n  const routineId = getActiveRoutineId();\n  const completionStatus =\n    window.RoutineCompletionV171?.status(state.currentDay, routineId) ||\n    { phase: "idle" };\n  const completionPending = completionStatus.phase === "pending";\n  const completionFailed = completionStatus.phase === "failed";''',
"calendar completion status")
s = replace_once(s,
'''      <button type="button" class="app-checkin-btn${currentComplete ? " is-done" : ""}" ${currentComplete ? "disabled" : ""}>\n        <span class="app-checkin-icon" aria-hidden="true">${currentComplete ? ICONS.checkCircleFilled : ICONS.check}</span>\n        <span>${currentComplete ? "Hecho hoy" : "Hoy lo hice"}</span>\n      </button>''',
'''      <button type="button" class="app-checkin-btn${currentComplete ? " is-done" : ""}${completionPending ? " is-pending" : ""}" ${(currentComplete || completionPending) ? "disabled" : ""}>\n        <span class="app-checkin-icon" aria-hidden="true">${currentComplete ? ICONS.checkCircleFilled : ICONS.check}</span>\n        <span>${currentComplete ? "Hecho hoy" : completionPending ? "Guardando..." : completionFailed ? "Volver a intentar" : "Hoy lo hice"}</span>\n      </button>''',
"calendar checkin label")
old = '''  const checkinBtn = todayCard.querySelector(".app-checkin-btn");\n  if (!currentComplete) {\n    checkinBtn.onclick = () => {\n      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);\n      setDayComplete(state.currentDay, true);\n      renderDays();\n\n      if (window.BackendAPI && isBackendManagedRoutine()) {\n        window.BackendAPI\n          .completeDay(state.currentDay)\n          .catch(error => {\n            console.warn(\n              "No se pudo sincronizar el completado con el backend.",\n              error\n            );\n          });\n      }\n    };\n  }'''
new = '''  const checkinBtn = todayCard.querySelector(".app-checkin-btn");\n  if (!currentComplete && !completionPending) {\n    checkinBtn.onclick = async () => {\n      if (!window.RoutineCompletionV171) {\n        console.warn("V171 no disponible para registrar el avance.");\n        renderDays();\n        return;\n      }\n\n      const task = window.RoutineCompletionV171.complete(state.currentDay, routineId);\n      renderDays();\n      try {\n        await task;\n        if (navigator.vibrate) navigator.vibrate([10, 30, 10]);\n      } catch (error) {\n        console.warn("No se pudo confirmar el completado de la rutina.", error);\n      }\n      renderDays();\n    };\n  }'''
s = replace_once(s, old, new, "calendar handler")
write(path, s)

# index.html: load the isolated core before the integration bridge, and the
# bridge after routine state/sync are defined but before the two completion UIs.
path = "index.html"
s = read(path)
s = replace_once(s,
'''  <script src="backend-client.js?v=136-unified-daily-unlock"></script>''',
'''  <script src="backend-client.js?v=136-unified-daily-unlock"></script>\n  <script src="routine-completion-core-v171.js?v=171-shared-confirmation"></script>''',
"load V171 core")
s = replace_once(s,
'''  <script src="routine-sync.js?v=136-unified-daily-unlock"></script>''',
'''  <script src="routine-sync.js?v=136-unified-daily-unlock"></script>\n  <script src="routine-completion-v171.js?v=171-shared-confirmation"></script>''',
"load V171 bridge")
write(path, s)

# Fail closed if the integration accidentally retains the old hidden writers.
checks = {
    "routine-state.js": ["completeProductRoutineDay(", "openProductRoutineDay("],
}
for filename, forbidden in checks.items():
    text = read(filename)
    for token in forbidden:
        if token in text:
            raise SystemExit(f"{filename}: forbidden hidden writer remains: {token}")

subprocess.check_call(["git", "diff", "--check"], cwd=ROOT)
print("V171 integration applied. Files changed:")
print(sh("git", "diff", "--name-only"))
