import('child_process').then(async ({ spawn }) => {
  const npx = 'C:\\Program Files\\nodejs\\npx.cmd'
  const env = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
  const proc = spawn(npx, ['tsx', 'src/index.ts'], { cwd: 'D:\\qwenproxy-main', stdio: 'pipe', env, shell: true })

  let out = ''
  proc.stdout.on('data', d => { out += d.toString() })
  proc.stderr.on('data', d => { out += d.toString() })

  // Wait for server to start
  while (!out.includes('Server listening on')) {
    await new Promise(r => setTimeout(r, 1000))
  }
  console.log('SERVER STARTED\n')

  // Test 1: Health
  try {
    const h = await (await fetch('http://localhost:3000/health')).json()
    console.log('HEALTH:', h.status)
  } catch(e) { console.log('HEALTH FAIL:', e.message) }

  // Test 2: Models
  try {
    const m = await (await fetch('http://localhost:3000/v1/models')).json()
    console.log('MODELS:', m.data?.length || 0)
  } catch(e) { console.log('MODELS FAIL:', e.message) }

  // Test 3: Chat non-streaming
  try {
    const r = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.7-plus',
        messages: [{ role: 'user', content: 'Say hello in 3 words' }],
        stream: false,
        max_tokens: 50
      })
    })
    const b = await r.json()
    console.log('CHAT STATUS:', r.status)
    console.log('RESPONSE:', b.choices?.[0]?.message?.content)
  } catch(e) { console.log('CHAT FAIL:', e.message) }

  proc.kill()
  console.log('\nDONE')
})
