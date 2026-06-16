async function test() {
  console.log('=== TEST: Streaming ONLY ===')
  const startTime = Date.now();
  try {
    const res = await fetch('http://localhost:3000/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.7-plus',
        messages: [{ role: 'user', content: 'Say hello in 2 words' }],
        stream: true,
        max_tokens: 50
      })
    })
    console.log('Status:', res.status)
    console.log('Headers:', Object.fromEntries(res.headers.entries()))
    
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let chunks = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks++
      console.log(`Chunk #${chunks}:`, decoder.decode(value).slice(0, 150))
    }
    console.log('Finished streaming. Total chunks:', chunks)
  } catch (err) {
    console.error('Error during test:', err)
  }
  console.log('Time elapsed:', (Date.now() - startTime), 'ms')
}
test().catch(console.error)
