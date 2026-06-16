async function test() {
  // Non-streaming test
  console.log('=== TEST: Non-streaming ===')
  const res1 = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.7-plus',
      messages: [{ role: 'user', content: 'Say hello in 2 words' }],
      stream: false,
      max_tokens: 50
    })
  })
  console.log('Status:', res1.status)
  const text1 = await res1.text()
  console.log('Body:', text1.slice(0, 500))
  
  // Streaming test
  console.log('\n=== TEST: Streaming ===')
  const res2 = await fetch('http://localhost:3000/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.7-plus',
      messages: [{ role: 'user', content: 'Say hello in 2 words' }],
      stream: true,
      max_tokens: 50
    })
  })
  console.log('Status:', res2.status)
  const reader = res2.body.getReader()
  const decoder = new TextDecoder()
  let c = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    c++
    if (c <= 3) console.log('Chunk:', decoder.decode(value).slice(0, 150))
  }
  console.log('Total chunks:', c)
  
  console.log('\nDone')
}
test().catch(console.error)
