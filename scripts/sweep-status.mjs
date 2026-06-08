import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'src', 'renderer', 'components')
const files = readdirSync(dir).filter(f => f.endsWith('.tsx') && f !== 'StatusText.tsx')

let count = 0
for (const f of files) {
  const p = join(dir, f)
  let c = readFileSync(p, 'utf8')
  if (!c.includes('{status}')) continue
  const before = c

  // Inline render:  >{status}</div>  /  >{status}</span>
  c = c.replace(/>\{status\}<\/(div|span)>/g, '><StatusText status={status} /></$1>')
  // Standalone render line:  <whitespace>{status}<whitespace>
  c = c.replace(/^(\s*)\{status\}(\s*)$/gm, '$1<StatusText status={status} />$2')

  if (c === before) continue

  if (!c.includes("from './StatusText'")) {
    const idx = c.indexOf('\n', c.indexOf('import'))
    c = c.slice(0, idx + 1) + "import StatusText from './StatusText'\n" + c.slice(idx + 1)
  }

  writeFileSync(p, c, 'utf8')
  console.log('OK  ', f)
  count++
}
console.log(`\nUpdated ${count} files.`)
