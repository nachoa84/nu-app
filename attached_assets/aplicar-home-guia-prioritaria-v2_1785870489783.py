from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path('.').resolve()
VERSION = '61e-guide-home-sections'
CACHE_NAME = 'nuapp-v61e-guide-home-sections'

required = [
    ROOT / 'index.html',
    ROOT / 'guide.css',
    ROOT / 'guide-view.js',
    ROOT / 'service-worker.js',
]

missing = [path.name for path in required if not path.is_file()]
if missing:
    raise SystemExit(
        '❌ Faltan archivos necesarios: ' + ', '.join(missing) +
        '\nEjecutá este script desde la raíz del Remix de Nu App.'
    )

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup_dir = ROOT / f'backup-home-guia-v2-{stamp}'
backup_dir.mkdir(parents=True, exist_ok=False)
for path in required:
    shutil.copy2(path, backup_dir / path.name)

home_markup = r'''
        <section id="homeGuideSection" class="home-guide-section" aria-labelledby="homeGuideTitle">
          <article class="home-guide-feature">
            <div class="home-guide-feature-copy">
              <span id="homeGuideKicker" class="home-guide-kicker">Empezá por acá</span>
              <h2 id="homeGuideTitle">Guía de inicio</h2>
              <p id="homeGuideDescription" class="home-guide-description">
                Tus primeros pasos para comenzar con claridad y acompañamiento.
              </p>

              <div class="home-guide-progress-row">
                <div class="home-guide-progress-copy">
                  <span id="homeGuideProgress">0 de 9 etapas</span>
                  <strong id="homeGuidePercent">0%</strong>
                </div>
                <div class="home-guide-progress" aria-hidden="true">
                  <span id="homeGuideProgressFill"></span>
                </div>
              </div>

              <button id="openGuideBtn" class="home-guide-action home-guide-open" type="button">
                <span id="homeGuideButtonLabel">Comenzar</span>
                <span class="home-guide-open-icon" aria-hidden="true"></span>
              </button>
            </div>

            <div class="home-guide-brand" aria-hidden="true">
              <img src="assets/guide/logo-nu-comunidad-transparent.png" alt="" />
            </div>
          </article>
        </section>

        <section class="home-routines-section" aria-labelledby="homeRoutinesTitle">
          <div class="home-section-heading">
            <div>
              <span>Tu día a día</span>
              <h2 id="homeRoutinesTitle">Mis rutinas</h2>
            </div>
          </div>

          <div class="home-routines">
            <article class="home-routine-card home-routine-card-active">
              <div class="home-routine-cover" aria-hidden="true">
                <img id="homeRoutineImage" src="assets/custom/routine-collagen-home.png" alt="Collagen+" />
              </div>

              <div class="home-routine-body">
                <div class="home-routine-heading">
                  <h2>Collagen+</h2>
                </div>
                <p id="homeRoutineDay" class="home-routine-day">Día 1 de 30</p>
                <div class="home-routine-progress-row">
                  <div class="home-routine-progress" aria-hidden="true">
                    <span id="homeRoutineProgressFill"></span>
                  </div>
                  <span id="homeRoutinePercent" class="home-routine-percent">3%</span>
                </div>
                <button id="startDayBtn" class="home-routine-continue" type="button">
                  <span id="homeRoutineContinueLabel">Continuar Día 1</span>
                  <span class="home-routine-continue-icon" aria-hidden="true"></span>
                </button>
                <button id="openRoutineBtn" class="home-routine-progress-link" type="button" hidden>Ver progreso de 30 días</button>
              </div>
            </article>

            <article class="home-routine-card home-routine-card-placeholder" aria-disabled="true">
              <div class="home-routine-cover" aria-hidden="true">
                <img src="assets/custom/routine-lumispa-home.png" alt="LumiSpa" />
              </div>
              <div class="home-routine-body">
                <div class="home-routine-heading"><h2>LumiSpa</h2></div>
                <p class="home-routine-day">Próximamente</p>
                <span class="home-routine-placeholder-label">Nueva rutina</span>
              </div>
            </article>

            <article class="home-routine-card home-routine-card-placeholder" aria-disabled="true">
              <div class="home-routine-cover" aria-hidden="true">
                <img src="assets/custom/routine-pharmanex-home.png" alt="Suplementos Pharmanex" />
              </div>
              <div class="home-routine-body">
                <div class="home-routine-heading"><h2>Suplementos</h2></div>
                <p class="home-routine-day">Próximamente</p>
                <span class="home-routine-placeholder-label">Nueva rutina</span>
              </div>
            </article>
          </div>
        </section>

        <div id="chatWrap"'''

home_css = r'''/* =========================================================
   Guía de inicio · Bloque prioritario de Home
   Separada visualmente de Mis rutinas, sin alterar sus lógicas.
   ========================================================= */

.home-guide-section {
  position: relative;
  overflow: hidden;
  margin: 0 0 28px;
  padding: 17px;
  border: 1px solid #dce4ee;
  border-radius: 26px;
  background:
    radial-gradient(circle at 94% 4%, rgba(122, 146, 96, .22), transparent 31%),
    linear-gradient(145deg, #eef2f9 0%, #f5f7fb 58%, #edf3e9 100%);
  box-shadow: 0 12px 30px rgba(23, 34, 61, .055);
}

.home-guide-section::after {
  content: "";
  position: absolute;
  right: -42px;
  bottom: -62px;
  width: 142px;
  height: 142px;
  border: 1px solid rgba(48, 79, 154, .08);
  border-radius: 50%;
  pointer-events: none;
}

.home-guide-feature {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 76px;
  align-items: start;
  gap: 14px;
}

.home-guide-feature-copy {
  min-width: 0;
}

.home-guide-kicker,
.home-section-heading span {
  display: block;
  color: #71865a;
  font-size: 9.5px;
  font-weight: 760;
  line-height: 1.2;
  letter-spacing: .065em;
  text-transform: uppercase;
}

.home-guide-feature h2 {
  margin: 5px 0 0;
  color: var(--home-ink, #17223d);
  font-size: 21px;
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: -.035em;
}

.home-guide-description {
  max-width: 245px;
  margin: 8px 0 0;
  color: #6f7885;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.48;
}

.home-guide-brand {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(48, 79, 154, .09);
  border-radius: 22px;
  background: rgba(255, 255, 255, .7);
  box-shadow: 0 10px 24px rgba(23, 34, 61, .06);
}

.home-guide-brand img {
  width: 56px;
  height: 56px;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 7px 14px rgba(23, 34, 61, .09));
}

.home-guide-progress-row {
  margin-top: 16px;
}

.home-guide-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: #717a87;
  font-size: 10.5px;
  font-weight: 560;
  line-height: 1.25;
}

.home-guide-progress-copy strong {
  color: #4b4aa5;
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.home-guide-progress {
  width: 100%;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(48, 79, 154, .11);
}

.home-guide-progress > span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #5149b8 0%, #304f9a 62%, #7a9260 100%);
  transition: width 260ms cubic-bezier(.2, 0, 0, 1);
}

.home-guide-action {
  width: fit-content;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 13px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #304f9a;
  color: #fff;
  box-shadow: 0 8px 17px rgba(48, 79, 154, .16);
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.home-guide-action:active {
  transform: scale(.98);
}

.home-guide-open-icon {
  width: 14px;
  height: 14px;
  display: grid;
  place-items: center;
}

.home-guide-open-icon svg {
  width: 14px;
  height: 14px;
}

.home-guide-section.is-complete {
  border-color: #dfe7dc;
  background:
    radial-gradient(circle at 94% 4%, rgba(122, 146, 96, .18), transparent 31%),
    linear-gradient(145deg, #f3f6f1 0%, #f8faf7 100%);
}

.home-guide-section.is-complete .home-guide-action {
  background: #edf1e9;
  color: #566b43;
  box-shadow: none;
}

.home-routines-section {
  margin: 0;
}

.home-section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  margin: 0 2px 13px;
}

.home-section-heading span {
  color: #9097a1;
}

.home-section-heading h2 {
  margin: 4px 0 0;
  color: var(--home-ink, #17223d);
  font-size: 20px;
  font-weight: 680;
  line-height: 1.1;
  letter-spacing: -.035em;
}

@media (max-width: 370px) {
  .home-guide-section {
    padding: 15px;
  }

  .home-guide-feature {
    grid-template-columns: minmax(0, 1fr) 64px;
    gap: 11px;
  }

  .home-guide-brand {
    width: 64px;
    height: 64px;
    border-radius: 19px;
  }

  .home-guide-brand img {
    width: 48px;
    height: 48px;
  }
}

'''

home_summary_function = r'''function updateGuideHomeSummary() {
  const { completed, percent } = guideProgressSummary();
  const total = GUIDE_STEPS.length;
  const isComplete = completed === total;
  const section = document.getElementById("homeGuideSection");
  const kicker = document.getElementById("homeGuideKicker");
  const description = document.getElementById("homeGuideDescription");
  const progressText = document.getElementById("homeGuideProgress");
  const progressFill = document.getElementById("homeGuideProgressFill");
  const percentText = document.getElementById("homeGuidePercent");
  const buttonLabel = document.getElementById("homeGuideButtonLabel");

  if (section) section.classList.toggle("is-complete", isComplete);
  if (kicker) kicker.textContent = isComplete ? "Guía completada" : "Empezá por acá";
  if (description) {
    description.textContent = isComplete
      ? "Volvé a consultar cualquier etapa cuando necesites repasar un recurso."
      : "Tus primeros pasos para comenzar con claridad y acompañamiento.";
  }
  if (progressText) progressText.textContent = `${completed} de ${total} etapas`;
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (percentText) percentText.textContent = `${percent}%`;
  if (buttonLabel) {
    buttonLabel.textContent = completed === 0
      ? "Comenzar"
      : isComplete
        ? "Ver guía"
        : "Continuar";
  }
}'''

# 1) index.html
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
if 'id="homeGuideSection"' not in index:
    home_pattern = re.compile(
        r'\n\s*<section class="home-routines"[^>]*>.*?</section>\n\n\s*<div id="chatWrap"',
        re.S,
    )
    index, count = home_pattern.subn('\n' + home_markup, index, count=1)
    if count != 1:
        raise SystemExit(
            '❌ No pude localizar el bloque actual de Home. '\
            f'Los originales quedaron guardados en {backup_dir.name}.'
        )

# Evita duplicar "Mis rutinas" si el título superior todavía tenía ese texto.
index = index.replace(
    '<h1 id="homeDayTitle">Mis rutinas</h1>',
    '<h1 id="homeDayTitle">Inicio</h1>',
)
index = re.sub(r'guide\.css\?v=[^"\']+', f'guide.css?v={VERSION}', index)
index = re.sub(r'guide-view\.js\?v=[^"\']+', f'guide-view.js?v={VERSION}', index)
index_path.write_text(index, encoding='utf-8')

# 2) guide.css
css_path = ROOT / 'guide.css'
css = css_path.read_text(encoding='utf-8')
css_pattern = re.compile(
    r'/\* =========================================================\n'
    r'\s*(?:Prototipo )?Guía de inicio.*?\n#view-guia \{',
    re.S,
)
css, count = css_pattern.subn(home_css + '#view-guia {', css, count=1)
if count != 1:
    raise SystemExit(
        '❌ No pude actualizar el bloque visual de guide.css. '\
        f'Los originales quedaron guardados en {backup_dir.name}.'
    )
css_path.write_text(css, encoding='utf-8')

# 3) guide-view.js
js_path = ROOT / 'guide-view.js'
js = js_path.read_text(encoding='utf-8')
js_pattern = re.compile(
    r'function updateGuideHomeSummary\(\) \{.*?\n\}',
    re.S,
)
js, count = js_pattern.subn(home_summary_function, js, count=1)
if count != 1:
    raise SystemExit(
        '❌ No pude actualizar updateGuideHomeSummary(). '\
        f'Los originales quedaron guardados en {backup_dir.name}.'
    )
js_path.write_text(js, encoding='utf-8')

# 4) service-worker.js: conserva el fix previo de ui-core.js y solo renueva esta versión.
sw_path = ROOT / 'service-worker.js'
sw = sw_path.read_text(encoding='utf-8')
sw, cache_count = re.subn(
    r'const CACHE="[^"]+";',
    f'const CACHE="{CACHE_NAME}";',
    sw,
    count=1,
)
if cache_count != 1:
    raise SystemExit(
        '❌ No pude actualizar el nombre de caché del Service Worker. '\
        f'Los originales quedaron guardados en {backup_dir.name}.'
    )
sw = re.sub(r'guide\.css\?v=[^"\']+', f'guide.css?v={VERSION}', sw)
sw = re.sub(r'guide-view\.js\?v=[^"\']+', f'guide-view.js?v={VERSION}', sw)
sw_path.write_text(sw, encoding='utf-8')

# Validaciones básicas.
if shutil.which('node'):
    for filename in ('guide-view.js', 'service-worker.js'):
        result = subprocess.run(
            ['node', '--check', filename],
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr, file=sys.stderr)
            raise SystemExit(
                f'❌ Falló la validación de {filename}. '\
                f'Restaurá desde {backup_dir.name}.'
            )

final_index = index_path.read_text(encoding='utf-8')
checks = {
    'Guía antes de las rutinas': final_index.find('id="homeGuideSection"') < final_index.find('id="homeRoutinesTitle"'),
    'Una sola tarjeta Guía': final_index.count('id="openGuideBtn"') == 1,
    'Una sola rutina Collagen+': final_index.count('id="startDayBtn"') == 1,
    'Chat conservado': final_index.count('id="chatWrap"') == 1,
}
failed = [label for label, ok in checks.items() if not ok]
if failed:
    raise SystemExit(
        '❌ Fallaron controles finales: ' + ', '.join(failed) +
        f'. Restaurá desde {backup_dir.name}.'
    )

print('✅ Home reorganizado correctamente.')
print('✅ Guía de inicio aparece primero con un fondo diferencial.')
print('✅ Mis rutinas queda como una segunda sección independiente.')
print('✅ Bot, Favoritos, backend, PostgreSQL y lógica de días no fueron modificados.')
print(f'✅ Backup creado: {backup_dir.name}')
print(f'✅ Nueva caché: {CACHE_NAME}')
print('\nAhora reiniciá el Repl y abrí: ?preview=1&v=guia-home-v2')
