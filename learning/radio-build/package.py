"""Build deterministic offline guide ZIP; never include personal progress/raw data."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'radiotelescope/build'
PIN = 'b6b04cf5cd5d756ca60888e317af1a5a3a0f0337'
ORIGINALS = {
    'DSPIRA-Horn-Can-2021.pdf': 'FilesUploaded/Horn%26Can_Assembly_2021.pdf',
    'DSPIRA-Cradle-2021.pdf': 'FilesUploaded/Cradle_Assembly_2021.pdf',
    'DSPIRA-Stand-2021.pdf': 'FilesUploaded/Stand_Assembly_2021.pdf',
    'DSPIRA-LICENSE.txt': 'LICENSE',
}
manifest = {
    'edition': '2026-10-18',
    'originals': [dict(file=name, url=f'https://github.com/WVURAIL/dspira-lessons/blob/{PIN}/{remote}',
                       sha256=hashlib.sha256((PUBLIC / 'files' / name).read_bytes()).hexdigest())
                  for name, remote in ORIGINALS.items()],
    'adaptations': ['horn-metric.svg: translated dimensions, not a full-size cutting template.',
                    'receiver-chain.svg: V4L + H1 + 20 m LMR-240 engineering adaptation; not hardware-tested.'],
    'sources': json.loads((ROOT / 'learning/radio-build/data.json').read_text())['sources'],
    'license_notice': 'Original DSPIRA documents: MIT, Copyright (c) 2020 WVU Radio Astronomy Instrumentation Lab.',
    'validation_limits': 'Software tested with synthetic files. No physical RF tests or full browser visual QA.',
}
(PUBLIC / 'files/SOURCES.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
data = json.loads((ROOT / 'learning/radio-build/data.json').read_text())
files = [PUBLIC / 'index.html', *sorted({PUBLIC / d['url'] for d in data['downloads']})]
with zipfile.ZipFile(PUBLIC / 'kit.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        if not file.is_file():
            raise ValueError(f'Unexpected directory: {file}')
        info = zipfile.ZipInfo(str(file.relative_to(PUBLIC)), (2026, 10, 18, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
with zipfile.ZipFile(PUBLIC / 'kit.zip') as archive:
    assert archive.testzip() is None
    assert len(archive.namelist()) == len(files)
print(f'Packaged {len(files)} files; {(PUBLIC / "kit.zip").stat().st_size:,} bytes; CRC OK')
