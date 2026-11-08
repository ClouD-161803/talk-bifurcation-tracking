"""A script that tiles the screenshots of the check, four per sheet at half size, for review."""
import sys
from pathlib import Path
from PIL import Image

folder, prefix, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
out.mkdir(exist_ok=True)
shots = sorted(folder.glob(f"{prefix}-*.png"))
for n in range(0, len(shots), 4):
    sheet = Image.new("RGB", (1920, 1080), "gray")
    for i, shot in enumerate(shots[n:n + 4]):
        image = Image.open(shot).convert("RGB").resize((958, 538))
        sheet.paste(image, ((i % 2) * 962, (i // 2) * 542))
    sheet.save(out / f"sheet-{n // 4 + 1:02d}.png")
print(len(shots), "shots")
