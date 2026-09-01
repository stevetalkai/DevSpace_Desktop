import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import WebSocket from 'ws'

const remotePort = process.env.DEVSPACE_TEST_REMOTE_PORT ?? '9333'
const targets = await fetch(`http://127.0.0.1:${remotePort}/json/list`).then((response) => response.json())
const target = targets.find((entry) => entry.type === 'page' && entry.title === 'DevSpace')
if (!target) throw new Error('DevSpace renderer target was not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolveOpen, rejectOpen) => {
  socket.once('open', resolveOpen)
  socket.once('error', rejectOpen)
})

let nextId = 1
const pending = new Map()
const protocolEvents = []
socket.on('message', (raw) => {
  const message = JSON.parse(String(raw))
  if (!message.id) {
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded') protocolEvents.push(message)
    return
  }
  const callback = pending.get(message.id)
  if (!callback) return
  pending.delete(message.id)
  if (message.error) callback.reject(new Error(message.error.message))
  else callback.resolve(message.result)
})

function command(method, params = {}) {
  const id = nextId++
  const response = new Promise((resolveCommand, rejectCommand) => {
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand })
  })
  socket.send(JSON.stringify({ id, method, params }))
  return response
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitForText(candidates, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastText = ''
  while (Date.now() < deadline) {
    lastText = await evaluate('document.body.innerText')
    if (candidates.some((candidate) => lastText.includes(candidate))) return lastText
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Timed out waiting for: ${candidates.join(' / ')}; renderer text: ${JSON.stringify(lastText)}`)
}

await command('Page.enable')
await command('Runtime.enable')
if (process.env.DEVSPACE_SMOKE_DEBUG === '1') {
  await command('Log.enable')
  await command('Page.reload', { ignoreCache: true })
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_000))
  console.log(await evaluate(`JSON.stringify({
    readyState: document.readyState,
    html: document.documentElement.outerHTML,
    resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    events: ${JSON.stringify(protocolEvents)}
  })`))
  socket.close()
  process.exit(0)
}
let initialText = await waitForText(['Start service', '启动服务', 'Stop service', '停止服务'])
if (initialText.includes('Stop service') || initialText.includes('停止服务')) {
  await evaluate("document.querySelector('.service-control')?.click()")
  initialText = await waitForText(['Stopped', '已停止'])
}
await evaluate("document.querySelector('.service-control')?.click()")
const startedText = await waitForText(['Running', '运行中', 'Service error', '服务错误'])

mkdirSync(resolve('artifacts'), { recursive: true })
const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
writeFileSync(resolve('artifacts/stage1-home.png'), Buffer.from(screenshot.data, 'base64'))

const started = startedText.includes('Running') || startedText.includes('运行中')
if (started) {
  await evaluate("document.querySelector('.service-control')?.click()")
  await waitForText(['Stopped', '已停止'])
}

socket.close()
console.log(JSON.stringify({
  rendered: initialText.includes('DevSpace'),
  coreStarted: started,
  screenshot: 'artifacts/stage1-home.png'
}))

if (!started) process.exitCode = 1
