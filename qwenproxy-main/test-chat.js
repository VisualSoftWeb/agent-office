import 'dotenv/config'
import { startServer } from './src/api/server.js'

// Start server and then test
const server = await startServer()

// Wait for full init
await new Promise(r => setTimeout(r, 5000))

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

console.log('Response status:', res.status)
const text = await res.text()
console.log('Response body (first 1000 chars):', text.slice(0, 1000))

process.exit(0)
