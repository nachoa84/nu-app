#!/usr/bin/env python3
"""Build the pilot from inventory 05 and verified Drive originals; never changes originals."""
import argparse
import hashlib
import json
import pathlib
import subprocess
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('--inventory', type=pathlib.Path, required=True)
parser.add_argument('--originals', type=pathlib.Path, required=True)
parser.add_argument('--output-root', type=pathlib.Path, required=True)
parser.add_argument('--routine-id', action='append',
                    help='Build only this inventory routine; repeat for multiple routines. Defaults to the pilot.')
parser.add_argument('--append', action='store_true',
                    help='Add selected routines to existing content and media manifest without changing prior entries.')
args = parser.parse_args()
inventory = json.loads(args.inventory.read_text())
assets = []
programs = {}
selected = set(args.routine_id or [])
available = {routine['proposed_id'] for routine in inventory['routines']}
if selected - available:
    parser.error(f"Unknown routine ids: {', '.join(sorted(selected - available))}")
if args.append:
    prefix = 'const SUPPLEMENT_ROUTINE_DAYS = '
    existing = (args.output_root / 'supplements-content.js').read_text()
    start = existing.index(prefix) + len(prefix)
    prior = json.loads(existing[start:].strip().removesuffix(';'))
    overlap = set(prior) & (selected or {routine['proposed_id'] for routine in inventory['routines'] if routine['pilot']})
    if overlap:
        parser.error(f"Already registered: {', '.join(sorted(overlap))}")
    for rid, program in prior.items():
        cover = args.output_root / 'assets/supplements/covers' / f'{rid}.png'
        if cover.is_file():
            program['cover'] = cover.relative_to(args.output_root).as_posix()

for routine in inventory['routines']:
    if selected and routine['proposed_id'] not in selected:
        continue
    if not selected and not routine['pilot']:
        continue
    rid = routine['proposed_id']
    program = dict(id=rid, title=routine['display_name'], totalDays=routine['duration_days'], days={})
    cover = args.output_root / 'assets/supplements/covers' / f'{rid}.png'
    if cover.is_file():
        program['cover'] = cover.relative_to(args.output_root).as_posix()
    task_path = args.output_root / 'docs' / f'supplements-{rid}-tasks.json'
    task_config = json.loads(task_path.read_text()) if task_path.exists() else None
    if rid == 'prysm-5' and task_config is None:
        parser.error('Prysm iO requires its daily task source')
    if task_config:
        assert set(task_config['days']) == {str(day['day']) for day in routine['days']}
        program['cover'] = task_config['cover']
    for day in routine['days']:
        blocks = [dict(type='text', **task) for task in task_config['days'][str(day['day'])]] if task_config else []
        assert len(day['assets']) == 3
        for asset in sorted(day['assets'], key=lambda item: item['position']):
            source = args.originals / asset['proposed_asset_filename']
            data = source.read_bytes()
            assert len(data) == asset['bytes'] and hashlib.sha256(data).hexdigest() == asset['sha256'], source
            folder = args.output_root / 'assets/supplements' / rid
            folder.mkdir(parents=True, exist_ok=True)
            stem = f"day-{day['day']:02}-{asset['position']}"
            dest = folder / (stem + ('.mp4' if asset['kind'] == 'video' else '.jpg'))
            if asset['kind'] == 'image':
                with Image.open(source) as im:
                    im = ImageOps.exif_transpose(im).convert('RGB')
                    im.thumbnail((1080, 1920), Image.Resampling.LANCZOS)
                    im.save(dest, 'JPEG', quality=88, optimize=True, progressive=True)
            else:
                subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                                '-map', '0:v:0', '-map', '0:a?', '-vf', "scale=w='min(720,iw)':h=-2",
                                '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p',
                                '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '2', str(dest)], check=True)
            entry = {key: asset[key] for key in ('id', 'position', 'kind', 'mime_type', 'bytes', 'sha256')}
            entry.update(routine=rid, day=day['day'], src=dest.relative_to(args.output_root).as_posix(),
                         optimized_bytes=dest.stat().st_size, optimized_sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
            block = dict(type='media', mediaType=asset['kind'], src=entry['src'],
                         label=f"{program['title']} · Día {day['day']} · Material {asset['position']}", shareable=True, favorite=True)
            if asset['kind'] == 'video':
                poster = folder / (stem + '-poster.webp')
                subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(dest),
                                '-frames:v', '1', '-vf', 'scale=360:-2', str(poster)], check=True)
                entry['poster'] = block['poster'] = poster.relative_to(args.output_root).as_posix()
            elif 'cover' not in program:
                program['cover'] = entry['src']
            assets.append(entry)
            blocks.append(block)
        blocks.append(dict(type='complete', label='Marcar día completado'))
        program['days'][str(day['day'])] = dict(title=f"Día {day['day']} · {program['title']}",
            hero='Tus materiales de hoy', description='Guardá o compartí los materiales que necesites.', blocks=blocks)
    programs[rid] = program

(args.output_root / 'docs').mkdir(exist_ok=True)
content_path = args.output_root / 'supplements-content.js'
manifest_path = args.output_root / 'docs/supplements-pilot-media.json'
if args.append:
    programs = {**prior, **programs}
    assets = json.loads(manifest_path.read_text()) + assets
manifest_path.write_text(json.dumps(assets, indent=2) + '\n')
content_path.write_text(
    '// Supplement materials from inventory 05, 2026-10-21; order preserved. Only Prysm has daily tasks.\n'
    'const SUPPLEMENT_ROUTINE_DAYS = '
    + json.dumps(programs, ensure_ascii=False, indent=2) + ';\n')
print(json.dumps(dict(materials=len(assets), optimized_bytes=sum(item['optimized_bytes'] for item in assets))))
