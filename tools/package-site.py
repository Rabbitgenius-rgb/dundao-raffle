#!/usr/bin/env python3
"""Package only the public game and atlas for the Sealos nginx container."""

from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
from pathlib import Path
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[1]
FILES = [
    'web/index.html', 'web/style.css', 'web/app.mjs', 'web/game.mjs',
    'web/evolution.mjs', 'web/sword.mjs', 'web/effects.mjs',
    'web/route-effects.mjs', 'web/scene.mjs', 'web/hammer.mjs', 'web/audio.mjs',
    'web/vendor/three.module.js', 'web/vendor/THREE-LICENSE.txt',
    'verification/route-gallery.html',
]
NGINX = '''server {
    listen 80;
    server_name _;
    root /opt/dundao/site;
    index index.html;
    charset utf-8;
    absolute_redirect off;
    types {
        text/html html;
        text/css css;
        application/javascript js mjs;
        application/json json;
        text/plain txt;
    }
    default_type application/octet-stream;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json;
    add_header Cache-Control "no-cache" always;
    location = / { return 302 /web/; }
    location / { try_files $uri $uri/ =404; }
}
'''


def main():
    hashes = {}
    for name in FILES:
        source = ROOT / name
        if not source.is_file() or source.is_symlink():
            raise RuntimeError(f'Unexpected or missing release file: {name}')
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()

    # Reject unresolved local module imports before creating the release.
    for name in FILES:
        if Path(name).suffix not in {'.mjs', '.html'}:
            continue
        text = (ROOT / name).read_text()
        for relative in re.findall(r'(?:from\s+|import\s*\()[\'\"]([^\'\"]+)[\'\"]', text):
            if relative.startswith('.'):
                resolved = ((ROOT / name).parent / relative).resolve()
                if resolved.relative_to(ROOT).as_posix() not in FILES:
                    raise RuntimeError(f'Unpackaged module: {name} -> {relative}')

    nginx_hash = hashlib.sha256(NGINX.encode()).hexdigest()
    digest = hashlib.sha256(json.dumps({'files': hashes, 'nginx_sha256': nginx_hash}, sort_keys=True).encode()).hexdigest()
    date = datetime.now(timezone(timedelta(hours=8))).strftime('%Y%m%d')
    release = f'dundao-twelve-routes-{date}-{digest[:12]}'
    output = ROOT / 'output' / 'releases' / release
    package = output / 'package'
    site = package / 'site'
    if output.exists():
        raise RuntimeError(f'Release already exists; inspect and reuse it: {output}')
    site.mkdir(parents=True)
    for name in FILES:
        target = site / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    shutil.copyfile(ROOT / 'LICENSE', site / 'LICENSE.txt')
    (package / 'nginx.conf').write_text(NGINX)
    manifest = {'release': release, 'source_sha256': digest, 'nginx_sha256': nginx_hash, 'files': hashes,
                'game_path': '/web/', 'atlas_path': '/verification/route-gallery.html'}
    (site / 'release.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

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
                      'sha256': archive_hash, 'source_sha256': digest}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
