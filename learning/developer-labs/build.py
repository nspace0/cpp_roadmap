"""Build the downloadable lab archive from its reviewed source manifest."""
import json
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[2]
data = json.loads((root / "learning/data/developer-labs.json").read_text())
target = root / "cpp-tools/labs.zip"
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for name, content in sorted(data["files"].items()):
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Unsafe archive path: " + name)
        item = ZipInfo("cpp-devtools-labs/" + name, date_time=(2026, 10, 18, 0, 0, 0))
        item.compress_type = ZIP_DEFLATED
        item.external_attr = 0o100644 << 16
        archive.writestr(item, content.encode("utf-8"))
print(f"Lab archive: {len(data['files'])} files, {target.stat().st_size} bytes")

