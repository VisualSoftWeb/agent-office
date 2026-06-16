import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.resolve(__dirname, 'qwen_profiles/f14c5ded-49ca-43d9-9d77-6801c60acf92');

(async () => {
  console.log('Abrindo navegador para login manual no Qwen...');
  
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  
  const page = await context.newPage();
  await page.goto('https://chat.qwen.ai/', { waitUntil: 'domcontentloaded' });
  
  console.log('\n========================================');
  console.log('1. Faça login com Google no navegador');
  console.log('2. Espere carregar o chat principal');
  console.log('3. Depois volte AQUI e pressione ENTER');
  console.log('========================================\n');
  
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });
  
  const url = page.url();
  if (url.includes('auth') || url.includes('login')) {
    console.log('Ainda na pagina de login. Login pode ter falhado.');
  } else {
    console.log('Login realizado com sucesso!');
    console.log('URL:', url);
    
    // Verify API works
    const userRes = await page.evaluate(async (base) => {
      const r = await fetch(base + '/api/v2/users/me', { headers: { 'Referer': base + '/' } });
      return r.json();
    }, 'https://chat.qwen.ai');
    console.log('Usuario:', userRes.data?.email || userRes.data?.name || 'ok');
  }
  
  await context.close();
  console.log('Sessao salva!');
})();
