// Package the Windows installer + portable .exe via electron-builder.
//
// We force CSC_IDENTITY_AUTO_DISCOVERY=false so the build never tries to apply a
// code-signing certificate (the app is intentionally unsigned — see CLAUDE.md).
// This keeps `npm run build` deterministic and avoids cert prompts.
//
// Note: electron-builder still prepares its winCodeSign toolchain on Windows.
// Its archive contains macOS symlinks that need a privilege standard accounts
// lack; if a clean machine fails extracting winCodeSign, either enable Windows
// Developer Mode or pre-extract that cache once. Once cached it persists.
const { spawnSync } = require('child_process')

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

const result = spawnSync('npx', ['electron-builder'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

process.exit(result.status ?? 1)
