import { spawn } from 'child_process'
import { createServer } from 'http'

// Start server
const npxPath = 'C:\\Program Files\\nodejs\\npx.cmd'
const serverProcess = spawn(npxPath, ['tsx', 'src/index.ts'], {
  cwd: 'D:\\qwenproxy-main',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
})

let serverOutput = ''
serverProcess.stdout.on('data', d => { serverOutput += d.toString() })
serverProcess.stderr.on('data', d => { serverOutput += d.toString() })

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server start timeout')), 120000)
    const check = () => {
      if (serverOutput.includes('Server listening on')) {
        clearTimeout(timeout)
        setTimeout(resolve, 3000) // extra time for warm pool
      } else {
        setTimeout(check, 1000)
      }
    }
    check()
  })
}

console.log('Starting server...')
await waitForServer()
console.log('Server started!')
console.log(serverOutput.slice(-500))

// Test non-streaming
console.log('\n=== TEST: Non-streaming ===')
{
  const res = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.7-plus',
      messages: [{ role: 'user', content: 'Say hello in 3 words' }],
      stream: false,
      max_tokens: 50
    })
  })
  console.log('Status:', res.status)
  const body = await res.text()
  console.log('Body:', body.slice(0, 600))
  try { console.log('Parsed OK:', JSON.parse(body)?.choices?.[0]?.message?.content) } catch {}
}

// Test streaming
console.log('\n=== TEST: Streaming ===')
{
  const res = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.7-plus',
      messages: [{ role: 'user', content: 'Say hello in 3 words' }],
      stream: true,
      max_tokens: 50
    })
  })
  console.log('Status:', res.status)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let c = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    c++
    if (c <= 3) console.log('Chunk:', decoder.decode(value).slice(0, 150))
  }
  console.log('Total chunks:', c)
}

serverProcess.kill()
console.log('\nDone')
