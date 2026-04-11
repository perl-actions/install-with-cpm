# CLAUDE.md

## Build

After any change to `index.js` or `lib.js`, you **must** regenerate the bundled distribution file:

```bash
npm run build
```

This runs `ncc build index.js` and updates `dist/index.js`. Always commit the regenerated `dist/index.js` alongside your source changes. CI will fail if `dist/index.js` is out of date.

## Test

```bash
npm test
```

## Lint

```bash
npm run lint
```
