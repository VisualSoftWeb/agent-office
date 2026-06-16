import { createQwenStream, RetryableQwenStreamError, QwenUpstreamError } from './services/qwen.js';
import { loadAccounts } from './core/accounts.js';
import { initPlaywright, initPlaywrightForAccount, closePlaywright } from './services/playwright.js';
import { config } from './core/config.js';

async function testChat() {
  console.log('=== QwenProxy Chat Test ===\n');
  
  const accounts = loadAccounts();
  console.log(`Loaded ${accounts.length} account(s)`);
  for (const acc of accounts) {
    console.log(`  - ${acc.email} (${acc.id})`);
  }
  
  if (accounts.length === 0) {
    console.log('No accounts configured. Run npm run login first.');
    process.exit(1);
  }
  
  const account = accounts[0];
  console.log(`\nTesting with account: ${account.email}`);
  
  console.log('\nInitializing Playwright...');
  await initPlaywright(config.browser.headless);
  
  console.log('Initializing account browser context...');
  await initPlaywrightForAccount(account, config.browser.headless);
  
  console.log('Pre-fetching headers...');
  const { warmAllPools } = await import('./services/qwen.js');
  // Skip warmAllPools to avoid background interference
  // await warmAllPools([account.id]);
  
  console.log('\n--- Test 1: createQwenStream (direct) ---');
  try {
    console.log('Calling createQwenStream...');
    const result = await createQwenStream(
      'Olá, tudo bem?',
      true,
      'qwen3.7-plus',
      null,
      account.id
    );
    console.log('Stream created successfully!');
    console.log('  uiSessionId:', result.uiSessionId);
    console.log('  accountId:', result.accountId);
    
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    let fullContent = '';
    
    console.log('Reading stream chunks...');
    while (true) {
      console.log(`  Waiting for chunk ${chunkCount + 1}...`);
      const { done, value } = await reader.read();
      if (done) {
        console.log('  Stream ended (done=true)');
        break;
      }
      chunkCount++;
      const text = decoder.decode(value, { stream: true });
      fullContent += text;
      if (chunkCount <= 5) {
        console.log(`  Chunk ${chunkCount}:`, text.slice(0, 100));
      }
      if (chunkCount % 10 === 0) {
        console.log(`  Received ${chunkCount} chunks so far...`);
      }
    }
    console.log(`\nTotal chunks: ${chunkCount}`);
    console.log(`Total content length: ${fullContent.length}`);
    console.log('First 200 chars:', fullContent.slice(0, 200));
    
    result.controller.abort();
    console.log('\n✅ Test 1 PASSED');
  } catch (err: any) {
    console.error('❌ Test 1 FAILED:', err.message);
    if (err.stack) console.error(err.stack);
  }
  
  console.log('\n--- Test 2: Second request (warm pool) ---');
  try {
    const result = await createQwenStream(
      'Como você está?',
      true,
      'qwen3.7-plus',
      null,
      account.id
    );
    console.log('Stream created successfully!');
    console.log('  uiSessionId:', result.uiSessionId);
    
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount++;
    }
    console.log(`Total chunks: ${chunkCount}`);
    result.controller.abort();
    console.log('\n✅ Test 2 PASSED');
  } catch (err: any) {
    console.error('❌ Test 2 FAILED:', err.message);
    if (err.stack) console.error(err.stack);
  }
  
  console.log('\n--- Test 3: Non-thinking model ---');
  try {
    const result = await createQwenStream(
      'Diga olá em uma frase.',
      false,
      'qwen3.7-plus-no-thinking',
      null,
      account.id
    );
    console.log('Stream created successfully!');
    
    const reader = result.stream.getReader();
    const decoder = new TextDecoder();
    let chunkCount = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunkCount++;
    }
    console.log(`Total chunks: ${chunkCount}`);
    result.controller.abort();
    console.log('\n✅ Test 3 PASSED');
  } catch (err: any) {
    console.error('❌ Test 3 FAILED:', err.message);
    if (err.stack) console.error(err.stack);
  }
  
  console.log('\n=== Cleanup ===');
  await closePlaywright();
  console.log('Done.');
}

testChat().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});