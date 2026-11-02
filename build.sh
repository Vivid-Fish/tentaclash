#!/usr/bin/env bash
# Build one self-contained dist/index.html: three.js, the game, the CSS and every
# asset inlined as a data URL. nginx serves that one file.
set -euo pipefail
cd "$(dirname "$0")"

# A file that uses THREE must import it, or the bundle fails at runtime instead of
# at build time. Match THREE.<Identifier> so prose about THREE does not trip it.
for f in $(find src -name '*.js'); do
  if grep -qE '(^|[^[:alnum:]_.])THREE\.[A-Za-z]' "$f" && ! grep -q "from 'three'" "$f"; then
    echo "ERROR: $f uses THREE but does not import it" >&2
    exit 1
  fi
done

rm -rf dist && mkdir -p dist

npx esbuild src/main.js \
  --bundle \
  --format=esm \
  --target=es2020 \
  --minify \
  --outfile=dist/game.mjs

python3 - <<'PYEOF'
import base64, glob, os, re, sys

MIME = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.m4a': 'audio/mp4', '.mp4': 'audio/mp4', '.wav': 'audio/wav',
        '.webp': 'image/webp'}

with open('dist/game.mjs') as f:
    js = f.read()

# Inline every asset referenced as assets/<path> anywhere in the bundle.
found = sorted(set(re.findall(r'assets/[\w./-]+', js)))
missing = [p for p in found if not os.path.exists(p)]
if missing:
    sys.exit(f'REFERENCED BUT MISSING: {missing}')

inlined = 0
for path in found:
    ext = os.path.splitext(path)[1].lower()
    if ext not in MIME:
        sys.exit(f'NO MIME FOR {path}')
    data = base64.b64encode(open(path, 'rb').read()).decode('ascii')
    js = js.replace(path, f'data:{MIME[ext]};base64,{data}')
    inlined += 1

css = open('src/ui/style.css').read()
html = open('src/index.template.html').read().replace('__CSS__', css).replace('__JS__', js)

os.makedirs('dist', exist_ok=True)
with open('dist/index.html', 'w') as f:
    f.write(html)

size = len(html.encode('utf-8'))
left = re.findall(r'assets/[\w./-]+', js)
print(f'dist/index.html {size/1024/1024:.2f} MB, {inlined} assets inlined')
if left:
    sys.exit(f'LEFTOVER asset references (not inlined): {left}')
PYEOF

rm -f dist/game.mjs
echo "single file, no external requests:"
grep -c 'src=\"http\|href=\"http' dist/index.html || true
