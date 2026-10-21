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
args = parser.parse_args()
inventory = json.loads(args.inventory.read_text())
assets = []
programs = {}

for routine in inventory['routines']:
    if not routine['pilot']:
        continue
    rid = routine['proposed_id']
    program = dict(id=rid, title=routine['display_name'], totalDays=routine['duration_days'], days={})
    for day in routine['days']:
        blocks = []
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
(args.output_root / 'docs/supplements-pilot-media.json').write_text(json.dumps(assets, indent=2) + '\n')
(args.output_root / 'supplements-content.js').write_text(
    '// Pilot materials from inventory 05, 2026-10-21; order preserved. No daily tasks.\nconst SUPPLEMENT_ROUTINE_DAYS = '
    + json.dumps(programs, ensure_ascii=False, indent=2) + ';\n')
print(json.dumps(dict(materials=len(assets), optimized_bytes=sum(item['optimized_bytes'] for item in assets))))
