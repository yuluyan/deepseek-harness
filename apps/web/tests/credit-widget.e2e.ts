// Keyless composition smoke for the sidebar credit widget: boot `dsh web`
// against a local mock balance endpoint and verify the footer pill renders the
// mocked balance without a real DeepSeek credential. This is the product-visible
// plugin's REAL-composition test (the boot path, Remote mount, slot registration,
// and pill render together), complementing the unit and component suites.
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterEach, describe, it } from 'vitest'
import { REPO_ROOT, requireDist } from './support.ts'

/** Wait for the launcher's ready line and return the tokenized launch URL. */
function waitForReadyLine(child: ChildProcess): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let out = ''
    const timer = setTimeout(() => { reject(new Error(`dsh web not ready in 90s; output:\n${out}`)) }, 90_000)
    const onData = (chunk: Buffer): void => {
      out += chunk.toString()
      const match = /dsh web: (http:\/\/[^\s]+)/.exec(out)
      if (match?.[1] !== undefined) {
        clearTimeout(timer)
        resolveReady(match[1])
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh web exited early (code ${code}); output:\n${out}`))
    })
  })
}

let child: ChildProcess | undefined
let browser: Browser | undefined
let sessionsDir: string | undefined
let mockServer: Server | undefined

afterEach(async () => {
  await browser?.close()
  browser = undefined
  const running = child
  if (running !== undefined && running.exitCode === null) {
    const closed = new Promise<void>(resolveClose => running.once('close', () => { resolveClose() }))
    running.kill('SIGTERM')
    await closed
  }
  child = undefined
  const mock = mockServer
  if (mock !== undefined) {
    await new Promise<void>(resolveClose => mock.close(() => { resolveClose() }))
    mockServer = undefined
  }
  if (sessionsDir !== undefined) rmSync(sessionsDir, { recursive: true, force: true })
  sessionsDir = undefined
})

describe('credit widget keyless composition smoke', () => {
  it('renders the sidebar credit pill from the mock balance endpoint', async () => {
    requireDist()
    const mock = createServer((request, response) => {
      if (request.url === '/user/balance') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          is_available: true,
          balance_infos: [
            { currency: 'CNY', total_balance: '88.50', granted_balance: '30.00', topped_up_balance: '58.50' },
            { currency: 'USD', total_balance: '12.34', granted_balance: '4.20', topped_up_balance: '8.14' },
          ],
        }))
        return
      }
      response.writeHead(404)
      response.end()
    })
    mockServer = mock
    await new Promise<void>(resolveListen => mock.listen(0, '127.0.0.1', resolveListen))
    const address = mock.address()
    if (address === null || typeof address === 'string') throw new Error('mock balance server did not bind a TCP port')

    sessionsDir = mkdtempSync(join(tmpdir(), 'dsh-web-credit-'))
    const tsxLoader = pathToFileURL(createRequire(join(REPO_ROOT, 'package.json')).resolve('tsx')).href
    child = spawn(
      process.execPath,
      ['--import', tsxLoader, join(REPO_ROOT, 'apps/cli/src/bin.ts'), 'web', '--no-open', '--port', '0'],
      {
        cwd: sessionsDir,
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: 'keyless-credit-widget',
          DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}`,
          DSH_HOME: join(sessionsDir, '.dsh'),
          DSH_AGENTS_HOME: join(sessionsDir, '.agents'),
          TSX_TSCONFIG_PATH: join(REPO_ROOT, 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

    const readyUrl = await waitForReadyLine(child)
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' })
    await page.goto(readyUrl)

    // The pill mounts once the sidebar declares its footer slot and the first
    // balance fetch settles. USD leads the deterministic currency order, so the
    // primary figure is the mocked USD total.
    const pill = page.locator('[data-credit-widget="pill"]')
    await pill.waitFor({ timeout: 30_000 })
    await pill.getByText('USD 12.34').waitFor({ timeout: 15_000 })

    await pill.click()
    const dialog = page.getByRole('dialog', { name: 'DeepSeek balance' })
    await dialog.waitFor({ timeout: 10_000 })
    await dialog.getByText('available 4.20').waitFor()
    await dialog.getByText('topped up 8.14').waitFor()
    await dialog.getByText('Top up ↗').waitFor()
  }, 120_000)
})
