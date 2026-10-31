"""Preserve Collagen retry feedback across redraws. Development only.

Applies only to the exact, previously reviewed uncommitted V170 file.
Does not commit, push, publish, access a database, or change other files.
"""
from pathlib import Path
import subprocess
import sys
import tempfile


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


if run('git', 'branch', '--show-current') != 'development':
    sys.exit('Detenido: la rama no es development.')
if subprocess.run(['git', 'diff', '--cached', '--quiet', '--', 'daily-view.js']).returncode:
    sys.exit('Detenido: daily-view.js tiene cambios staged.')
if not run('git', 'hash-object', 'daily-view.js').startswith('ce68843'):
    sys.exit('Detenido: daily-view.js no coincide con el V170 revisado. No se modificó nada.')

path = Path('daily-view.js')
source = path.read_text(encoding='utf-8')
updated = source


def replace_once(old, new):
    global updated
    if updated.count(old) != 1:
        sys.exit('Detenido: no coincide un bloque de V170. No se modificó nada.\n' + old[:100])
    updated = updated.replace(old, new, 1)


replace_once(
    'const collagenCompletionPendingV170 = new Map();',
    'const collagenCompletionPendingV170 = new Map();\n'
    'const collagenCompletionFailedV170 = new Set();'
)
replace_once(
    '    const done = isDayComplete(day);',
    '    const completionKey = `${userId}:${day}`;\n'
    '    const done = isDayComplete(day);'
)
replace_once(
    '    if (done) {\n      renderDoneState();\n      return card;\n    }',
    '    if (done) {\n'
    '      if (backendManaged) collagenCompletionFailedV170.delete(completionKey);\n'
    '      renderDoneState();\n      return card;\n    }'
)
replace_once(
    '      if (isCollagenCompletionPendingV170(day)) return;\n      renderPendingState();',
    '      if (isCollagenCompletionPendingV170(day)) return;\n'
    '      collagenCompletionFailedV170.delete(completionKey);\n'
    '      renderPendingState();'
)
replace_once(
    '        await confirmCollagenDayV170(day);\n        if (!stillHere()) return;',
    '        await confirmCollagenDayV170(day);\n'
    '        collagenCompletionFailedV170.delete(completionKey);\n'
    '        if (!stillHere()) return;'
)
replace_once(
    '        if (!stillHere()) return;\n        if (Number(selectedDay) !== day || !card.isConnected) {\n'
    '          refreshDetached();\n          return;\n        }\n        renderRetryState();',
    '        if (!stillHere()) return;\n'
    '        collagenCompletionFailedV170.add(completionKey);\n'
    '        if (Number(selectedDay) !== day || !card.isConnected) {\n'
    '          refreshDetached();\n          return;\n        }\n        renderRetryState();'
)
replace_once(
    '    if (backendManaged && isCollagenCompletionPendingV170(day)) {\n'
    '      renderPendingState();\n    }\n    return card;',
    '    if (backendManaged && isCollagenCompletionPendingV170(day)) {\n'
    '      renderPendingState();\n'
    '    } else if (backendManaged && collagenCompletionFailedV170.has(completionKey)) {\n'
    '      renderRetryState();\n    }\n    return card;'
)

# Validate the complete proposed file before changing the working copy.
with tempfile.NamedTemporaryFile(mode='w', suffix='.js', encoding='utf-8', delete=False) as handle:
    handle.write(updated)
    temporary = Path(handle.name)
try:
    subprocess.run(['node', '--check', str(temporary)], check=True)
finally:
    temporary.unlink(missing_ok=True)

path.write_text(updated, encoding='utf-8')
print('V170: reintento conservado entre redibujados. Sin commit, push ni publicación.')
subprocess.run(['node', '--test',
    'tests/routine-completion-confirmation-v170.test.js',
    'tests/routine-completion-redraw-v170.test.js',
    'tests/routine-active-sync-v169.test.js'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
print('Pruebas completas. No publicar todavía.')
