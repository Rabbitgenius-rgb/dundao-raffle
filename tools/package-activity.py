#!/usr/bin/env python3
"""Create an immutable Node/SQLite release. Credentials and databases are excluded."""
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ['web/index.html', 'web/style.css', 'web/app.mjs', 'web/game.mjs',
          'web/evolution.mjs', 'web/sword.mjs', 'web/effects.mjs',
          'web/route-effects.mjs', 'web/scene.mjs', 'web/hammer.mjs', 'web/audio.mjs',
          'web/activity.mjs', 'web/admin.html', 'web/admin.css', 'web/admin.mjs',
          'web/leaderboard.html', 'web/leaderboard.css', 'web/leaderboard.mjs',
          'web/vendor/three.module.js', 'web/vendor/THREE-LICENSE.txt',
          'verification/route-gallery.html']
SERVER = ['server/server.mjs', 'server/store.mjs']

def main():
    files = PUBLIC + SERVER
    hashes = {}
    for name in files:
        source = ROOT / name
        if not source.is_file() or source.is_symlink():
            raise RuntimeError(f'Unexpected release file: {name}')
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
        if source.suffix in {'.mjs', '.html'}:
            for relative in re.findall(r'(?:from\s+|import\s*\()[\'\"]([^\'\"]+)[\'\"]', source.read_text()):
                if relative.startswith('.'):
                    resolved = (source.parent / relative).resolve().relative_to(ROOT).as_posix()
                    if resolved not in files:
                        raise RuntimeError(f'Unpackaged module: {name} -> {relative}')
    digest = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
    date = datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d')
    release = f'dundao-activity-{date}-{digest[:12]}'
    output = ROOT / 'output' / 'releases' / release
    if output.exists():
        raise RuntimeError(f'Release exists; inspect and reuse: {output}')
    package = output / 'package'
    package.mkdir(parents=True)
    for name in files:
        target = package / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    shutil.copyfile(ROOT / 'LICENSE', package / 'LICENSE.txt')
    manifest = {'release': release, 'source_sha256': digest,
                'files': {name: hashes[name] for name in PUBLIC},
                'server_sha256': {name: hashes[name] for name in SERVER},
                'game_path': '/web/', 'admin_path': '/admin', 'leaderboard_path': '/leaderboard', 'persistent_data_path': '/data'}
    (package / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    archive = output / (release + '.tar.gz')
    def normalize(info):
        info.uid = info.gid = info.mtime = 0
        info.uname = info.gname = 'root'
        info.mode = 0o755 if info.isdir() else 0o644
        return info
    with archive.open('xb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w') as tar:
            for path in sorted(package.rglob('*')):
                tar.add(path, arcname=path.relative_to(package).as_posix(), recursive=False, filter=normalize)
    archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'SHA256SUMS').write_text(f'{archive_hash}  {archive.name}\n')
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'release': release, 'archive': str(archive), 'bytes': archive.stat().st_size,
                      'sha256': archive_hash}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
