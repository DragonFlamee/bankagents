"""Contact sheets from render/sNN.png."""
import sys, glob
from PIL import Image
fs = sorted(glob.glob("render/s*.png")); per = int(sys.argv[1]) if len(sys.argv) > 1 else 4
for k in range(0, len(fs), per):
    ims = [Image.open(f).convert("RGB").resize((1200, 675)) for f in fs[k:k + per]]
    s = Image.new("RGB", (2410, 1360 if len(ims) > 2 else 675), "#777")
    for i, im in enumerate(ims): s.paste(im, ((i % 2) * 1210, (i // 2) * 685))
    s.save(f"preview/sheet{k // per + 1}.jpg", quality=88)
