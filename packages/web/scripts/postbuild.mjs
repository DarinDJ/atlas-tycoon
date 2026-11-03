// GitHub Pages serves 404.html for unknown paths; using the app shell makes client-side routes (/room/ABCDE) work.
import { copyFileSync, existsSync } from 'node:fs';
if (existsSync('dist/index.html')) copyFileSync('dist/index.html', 'dist/404.html');
