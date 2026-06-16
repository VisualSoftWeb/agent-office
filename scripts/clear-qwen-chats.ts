import { chromium, BrowserContext } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilePath = path.resolve(__dirname, '../qwenproxy-main/qwen_profiles/f14c5ded-49ca-43d9-9d77-6801c60acf92');
const QWEN_BASE = 'https://chat.qwen.ai';

type QwenChat = { id: string; title: string };

async function getChats(context: BrowserContext): Promise<QwenChat[]> {
  const page = await context.newPage();
  try {
    await page.goto(`${QWEN_BASE}/`, { waitUntil: 'networkidle', timeout: 30000 });

    const res = await page.evaluate(async (base) => {
      const r = await fetch(`${base}/api/v2/chats/?page=1&exclude_project=true`, {
        headers: { 'Referer': base + '/' },
      });
      return r.json();
    }, QWEN_BASE);

    const items = (res.data?.chats || res.chats || []) as any[];
    return items.map((c: any) => ({
      id: c.id || c.chat_id,
      title: c.title || '(sem título)',
    }));
  } finally {
    await page.close();
  }
}

async function deleteChat(context: BrowserContext, chatId: string): Promise<boolean> {
  const page = await context.newPage();
  try {
    const ok = await page.evaluate(async (url) => {
      const r = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Referer': 'https://chat.qwen.ai/',
          'Content-Type': 'application/json',
        },
      });
      return r.ok;
    }, `${QWEN_BASE}/api/v2/chats/${chatId}`);
    return ok;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function clearQwenChats() {
  console.log('Iniciando limpeza de conversas do Qwen...');

  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ],
    });

    const chats = await getChats(context);
    console.log(`Total de conversas encontradas: ${chats.length}`);

    if (chats.length === 0) {
      console.log('Nenhuma conversa para limpar.');
      return;
    }

    let deleted = 0;
    for (const chat of chats) {
      const ok = await deleteChat(context, chat.id);
      if (ok) {
        deleted++;
        console.log(`[${deleted}/${chats.length}] Excluída: ${chat.title}`);
      } else {
        console.log(`[${deleted + 1}/${chats.length}] Falha ao excluir: ${chat.title}`);
      }
    }

    console.log(`Total de conversas excluídas: ${deleted}`);
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (context) await context.close();
  }
}

clearQwenChats();
