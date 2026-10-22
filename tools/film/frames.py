# After Effects TIFF sequence -> web frames: l/ (1600x900) for desktop, s/ (960x540) for phones.
import sys, glob, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, 'f_*.tif')))
for size, q, sub in [((1600, 900), 74, 'l'), ((960, 540), 70, 's')]:
    os.makedirs(os.path.join(dst, sub), exist_ok=True)
    total = 0
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB')
        if im.size != size:
            im = im.resize(size, Image.LANCZOS)
        out = os.path.join(dst, sub, '%03d.webp' % i)
        im.save(out, 'WEBP', quality=q, method=6)
        total += os.path.getsize(out)
    print(sub, len(files), 'frames', round(total / 1e6, 2), 'MB')
