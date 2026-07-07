import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { agentBridgeOpenApi } from '../src/index.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutput = resolve(projectRoot, 'docs/openapi.json')

const args = process.argv.slice(2)
const check = args.includes('--check')
const outputArgIndex = args.indexOf('--output')
const output = outputArgIndex >= 0 && args[outputArgIndex + 1]
  ? resolve(process.cwd(), args[outputArgIndex + 1])
  : defaultOutput

const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
const content = `${JSON.stringify(agentBridgeOpenApi({ version: packageJson.version }), null, 2)}\n`

if (check) {
  let current = ''
  try {
    current = await readFile(output, 'utf8')
  } catch {
    console.error(`OpenAPI contract missing: ${displayPath(output)}`)
    process.exit(1)
  }
  if (current !== content) {
    console.error('OpenAPI contract is stale: run `npm run contracts:generate`')
    process.exit(1)
  }
  console.log(`OpenAPI contract is up to date: ${displayPath(output)}`)
} else {
  await writeFile(output, content, 'utf8')
  console.log(`Wrote ${displayPath(output)}`)
}

function displayPath(path) {
  return relative(projectRoot, path) || '.'
}
