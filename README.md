# Bluey's House & Keepy Uppy 3D

## Local development

Use Node.js 22.x.

```sh
npm ci
npm run dev
```

## Production build

```sh
npm run build
npm run preview
```

The Vite PWA plugin generates and registers the service worker during production
builds. It caches the application shell and audio files for offline use. The 3D
models are intentionally not precached because they total over 150 MB; the
interactive world requires a network connection to load those assets.

The supplied logo is used on the main menu and as the favicon/PWA icon. Resized
192x192 and 512x512 copies live in `public/icons/` and are declared in the
manifest. A separate maskable 512x512 icon can be added later if desired.

## Git and large assets

The original Blender source models in `raw models/` use Git LFS through
`.gitattributes`. Optimized runtime models in `public/models/` are stored as
regular Git files so Vercel receives the actual GLB data instead of LFS pointer
files. Install Git LFS to clone or update the source models:

```sh
git lfs install
```

Generated build output, installed dependencies, local environment files, and
Vercel metadata are excluded by `.gitignore`.

## Vercel deployment

Import the Git repository into Vercel. The included `vercel.json` configures
`npm ci`, `npm run build`, and `dist` as the output directory.
