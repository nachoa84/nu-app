from pathlib import Path
import hashlib, subprocess, sys

if subprocess.check_output(['git','branch','--show-current'], text=True).strip() != 'development':
    sys.exit('Detenido: la rama no es development.')
p = Path('daily-view.js')
for args in (["git", "diff", "--quiet", "--", str(p)], ["git", "diff", "--cached", "--quiet", "--", str(p)]):
    if subprocess.run(args, check=False).returncode != 0:
        sys.exit('Detenido: hay cambios previos en daily-view.js. No se modificó nada.')
s = p.read_text(encoding='utf-8')
actual = hashlib.sha1(b'blob ' + str(len(s.encode())).encode() + b'\0' + s.encode()).hexdigest()
expected = '08a9cf4a9458f179c6ed26828789eca497b65875'
if actual != expected:
    sys.exit(f'Detenido: daily-view.js no coincide con la versión auditada.\nSHA actual: {actual}\nNo se modificó nada.')
helper = '''// NU APP · CONFIRMACIÓN DE PROGRESO COLLAGEN V170
// No confirma ni repite el POST sin verificar el estado oficial.
const collagenCompletionPendingV170 = new Map();

function isCollagenCompletionPendingV170(day) {
  const userId = String(getRoutineProfile()?.userId || "");
  return collagenCompletionPendingV170.has(`${userId}:${Number(day)}`);
}

function isCollagenDayConfirmedV170(state, day, userId) {
  return Boolean(
    state &&
    String(state.userId || "") === String(userId) &&
    Array.isArray(state.completedDays) &&
    state.completedDays.some(value => Number(value) === Number(day))
  );
}

function confirmCollagenDayV170(day) {
  const safeDay = Number(day);
  const userId = String(getRoutineProfile()?.userId || "");
  if (!userId || !Number.isInteger(safeDay) || safeDay < 1 || safeDay > 30) {
    return Promise.reject(new Error("No se pudo identificar el día o la cuenta."));
  }

  const key = `${userId}:${safeDay}`;
  if (collagenCompletionPendingV170.has(key)) {
    return collagenCompletionPendingV170.get(key);
  }

  const task = (async () => {
    const api = window.BackendAPI;
    let state = null;
    let originalError = null;

    try {
      if (!api || typeof api.completeDay !== "function") {
        throw new Error("Backend no disponible.");
      }
      state = await api.completeDay(safeDay);
    } catch (error) {
      originalError = error;
    }

    if (String(getRoutineProfile()?.userId || "") !== userId) {
      throw new Error("La cuenta cambió durante el registro.");
    }

    // Un error puede ocurrir después del COMMIT. Consultar una vez
    // permite recuperar el día sin repetir automáticamente el POST.
    if (!isCollagenDayConfirmedV170(state, safeDay, userId)) {
      try {
        if (!api || typeof api.getState !== "function") {
          throw new Error("No se pudo consultar el estado oficial.");
        }
        state = await api.getState();
      } catch (error) {
        console.warn("No se pudo verificar el completado de Collagen.", error);
      }
    }

    if (String(getRoutineProfile()?.userId || "") !== userId) {
      throw new Error("La cuenta cambió durante el registro.");
    }
    if (!isCollagenDayConfirmedV170(state, safeDay, userId)) {
      throw originalError || new Error("El servidor no confirmó el día completado.");
    }
    return state;
  })().finally(() => {
    collagenCompletionPendingV170.delete(key);
  });

  collagenCompletionPendingV170.set(key, task);
  return task;
}

'''
anchor = 'function createBlock(block) {'
assert s.count(anchor) == 1
s = s.replace(anchor, helper + anchor, 1)
old = '''    const done = isDayComplete(selectedDay);

    const renderDoneState'''
new = '''    const day = Number(selectedDay);
    const routineId = getActiveRoutineId();
    const userId = String(getRoutineProfile()?.userId || "");
    const backendManaged = isBackendManagedRoutine();
    const done = isDayComplete(day);

    const renderDoneState'''
assert s.count(old) == 1
s = s.replace(old,new,1)
old = '''      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.innerHTML'''
new = '''      card.classList.add("done");
      card.classList.toggle("just-completed", animate && !prefersReducedMotion());
      card.removeAttribute("aria-busy");
      card.innerHTML'''
assert s.count(old) == 1
s = s.replace(old,new,1)
start = s.index('    btn.onclick = () => {\n      setDayComplete(selectedDay, true);')
end = s.index('    card.append(btn, helper);',start)
replacement = '''    const renderPendingState = () => {
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
      // Las rutinas de producto mantienen su flujo existente.
      if (!backendManaged) {
        setDayComplete(day, true);
        if (navigator.vibrate) navigator.vibrate(12);
        renderDoneState({ animate: true });
        renderDays();
        return;
      }

      if (isCollagenCompletionPendingV170(day)) return;
      renderPendingState();
      renderDays();

      const stillHere = () =>
        getActiveRoutineId() === routineId &&
        String(getRoutineProfile()?.userId || "") === userId;
      const refreshDetached = () => {
        if (Number(selectedDay) === day && !card.isConnected) {
          renderStructuredDayDetail();
        }
      };

      try {
        await confirmCollagenDayV170(day);
        if (!stillHere()) return;
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        // La marca local solo se escribe tras la confirmación oficial.
        setDayComplete(day, true);
        if (navigator.vibrate) navigator.vibrate(12);
        renderDoneState({ animate: true });
        renderDays();
      } catch (error) {
        console.warn("No se pudo confirmar el completado de Collagen.", error);
        if (!stillHere()) return;
        if (Number(selectedDay) !== day || !card.isConnected) {
          refreshDetached();
          return;
        }
        renderRetryState();
        renderDays();
      }
    };

'''
s = s[:start] + replacement + s[end:]
old = '''    card.append(btn, helper);
    return card;
  }
}

function createCompactMediaItem'''
new = '''    card.append(btn, helper);
    if (backendManaged && isCollagenCompletionPendingV170(day)) {
      renderPendingState();
    }
    return card;
  }
}

function createCompactMediaItem'''
assert s.count(old) == 1
s = s.replace(old,new,1)
# A failed syntax check must not overwrite the target.
import tempfile
with tempfile.NamedTemporaryFile(mode='w',suffix='.js',encoding='utf-8',delete=False) as f:
    f.write(s)
    temp = Path(f.name)
try:
    subprocess.run(['node','--check',str(temp)],check=True)
finally:
    temp.unlink(missing_ok=True)
p.write_text(s,encoding='utf-8')
print('V170 aplicado a daily-view.js. No se hizo commit, push ni publicación.')

subprocess.run(['node','--test','tests/routine-completion-confirmation-v170.test.js','tests/routine-active-sync-v169.test.js'],check=True)
subprocess.run(['git','diff','--check'],check=True)
print('Pruebas completas. Revisá git diff y no publiques todavía.')
