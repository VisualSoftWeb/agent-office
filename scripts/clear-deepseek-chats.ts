import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.resolve(__dirname, '../deepsproxy-main/deepseek_profile');

async function clearDeepSeekChats() {
  console.log('Iniciando limpeza de conversas do DeepSeek...');

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu'],
    });

    const page = await context.newPage();
    await page.goto('https://chat.deepseek.com/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Verificar login
    const chatInput = await page.$('textarea, [role="textbox"], [contenteditable="true"]');
    if (!chatInput) {
      console.log('Aguardando login...');
      await page.waitForSelector('textarea, [role="textbox"], [contenteditable="true"]', { timeout: 120000 });
      await page.waitForTimeout(3000);
    }

    console.log('Pronto para limpar conversas...');

    let deletedCount = 0;
    let maxIterations = 100;

    for (let i = 0; i < maxIterations; i++) {
      // Encontrar e clicar no primeiro chat via page.locator
      const firstChat = page.locator('a._546d736').first();
      const chatCount = await page.locator('a._546d736').count();

      if (chatCount === 0) {
        console.log('Nenhuma conversa restante. Limpeza concluída!');
        break;
      }

      // Hover no chat pra revelar 3 pontinhos
      await firstChat.hover();
      await page.waitForTimeout(500);

      // Clicar nos 3 pontinhos (div[role="button"] dentro do chat)
      const moreBtn = firstChat.locator('div[role="button"]');
      if (await moreBtn.count() === 0) {
        console.log(`Iteração ${i + 1}: botão de 3 pontinhos não encontrado`);
        continue;
      }

      await moreBtn.click();
      await page.waitForTimeout(1000);

      // Encontrar e clicar em "Excluir" no menu
      const deleteOption = page.locator('.ds-dropdown-menu-option--error');
      if (await deleteOption.count() === 0) {
        console.log(`Iteração ${i + 1}: opção Excluir não encontrada`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        continue;
      }

      await deleteOption.click();
      await page.waitForTimeout(1000);

      // Procurar botão de confirmação
      const confirmBtns = page.locator('button, div[role="button"]');
      const count = await confirmBtns.count();
      for (let j = 0; j < count; j++) {
        const btn = confirmBtns.nth(j);
        const text = await btn.textContent();
        if (/confirmar|confirm|sim|ok|delete|excluir/i.test(text || '')) {
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      }

      deletedCount++;
      console.log(`Conversa ${deletedCount} excluída`);
      await page.waitForTimeout(1500);
    }

    console.log(`\nTotal de conversas excluídas: ${deletedCount}`);

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (context) await context.close();
  }
}

clearDeepSeekChats();