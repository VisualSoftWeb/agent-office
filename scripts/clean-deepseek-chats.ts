import { chromium } from "../deepsproxy/node_modules/playwright/index.mjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROFILE_PATH = path.resolve(ROOT, "deepseek_profile");
const CHAT_URL = "https://chat.deepseek.com/";
const MAX_DELETIONS = Infinity;

function log(msg: string) {
  process.stdout.write(`[${new Date().toLocaleTimeString("pt-BR")}] ${msg}\n`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log("🧹 Limpando todas as conversas do DeepSeek...\n");

  if (!fs.existsSync(PROFILE_PATH)) {
    log("❌ Perfil do navegador não encontrado em: deepseek_profile/");
    log("");
    log("📋 Para configurar o login pela primeira vez:");
    log("   1. Execute: npm run login:deepseek");
    log("   2. Faça login manualmente no navegador que abrir");
    log("   3. Feche o navegador");
    log("   4. Execute este script novamente");
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(PROFILE_PATH, {
    headless: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--exclude-switches=enable-automation",
      "--disable-infobars",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await context.newPage();

  try {
    log("📡 Navegando para " + CHAT_URL);
    await page.goto(CHAT_URL, { waitUntil: "load", timeout: 60000 });
    await sleep(8000);

    // Wait for page to stabilize, handling potential redirects
    let attempts = 0;
    while (attempts < 3) {
      try {
        await page.waitForLoadState("networkidle", { timeout: 15000 });
        break;
      } catch {
        attempts++;
        await sleep(2000);
      }
    }

    // Check for CAPTCHA
    let captchaResolved = false;
    try {
      const captchaBtn = await page.$("#amzn-captcha-verify-button", { timeout: 3000 });
      if (captchaBtn) {
        log("⚠️  CAPTCHA da AWS detectado! Resolva manualmente no navegador...");
        log("   Após resolver, o script continuará automaticamente.\n");
        try {
          await page.waitForURL((url) => !url.href.includes("captcha"), {
            timeout: 120000,
          });
          log("✅ CAPTCHA resolvido!");
          captchaResolved = true;
        } catch {
          log("❌ Tempo limite excedido para resolver o CAPTCHA.");
          return;
        }
        await sleep(3000);
      }
    } catch {
      log("⚠️  Erro ao verificar CAPTCHA, continuando...");
    }

    // Verify login — wait for user to login manually if needed
    let loginOk = false;
    for (let i = 0; i < 5; i++) {
      try {
        const state = await page.evaluate(() => {
          const hasChatInput = !!document.querySelector('textarea, [role="textbox"], [contenteditable="true"]');
          const hasUserAvatar = !!document.querySelector('[class*="avatar"], [class*="user-detail"], [class*="profile"]');
          const hasChatUrl = window.location.pathname.includes("/chat/");
          const hasLoginForm = !!document.querySelector('input[type="email"], input[type="password"], form[action*="login"]');

          if (hasChatInput || hasUserAvatar || hasChatUrl) return "ok";
          if (hasLoginForm) return "login_page";
          return "unknown";
        });

        if (state === "ok") {
          loginOk = true;
          log("✅ Login OK, chat pronto.");
          break;
        }

        if (state === "login_page") {
          log("🔑 Página de login detectada. Faça login manualmente no navegador...");
          log("   Após logar, o script continuará automaticamente.\n");
          try {
            await page.waitForFunction(() => {
              return !!document.querySelector('textarea, [role="textbox"], [contenteditable="true"]');
            }, { timeout: 120000 });
            loginOk = true;
            log("✅ Login manual detectado!");
            break;
          } catch {
            log("⏱️ Tempo limite excedido para login manual (2 min).");
            return;
          }
        }

        log(`⏳ Aguardando carregamento (tentativa ${i + 1}/5)...`);
        await sleep(3000);
      } catch (e: any) {
        log(`⚠️  Erro na verificação (tentativa ${i + 1}/5): ${e.message}`);
        await sleep(3000);
      }
    }

    if (!loginOk) {
      log("⚠️  Não foi possível confirmar login. Tentando continuar mesmo assim...");
    }

    // Force navigate to chat home after login
    await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await sleep(3000);

    // Wait for the sidebar to fully load
    await sleep(3000);
    try {
      await page.goto(CHAT_URL, { waitUntil: "networkidle", timeout: 30000 });
    } catch {
      log("⚠️  Timeout no networkidle, continuando...");
    }
    await sleep(4000);

    let deleted = 0;
    let emptyPasses = 0;

    while (deleted < MAX_DELETIONS && emptyPasses < 6) {
      // Collect batch of items to delete
      let batch: { name: string; strategy: string; element?: Element }[] = [];
      
      try {
        batch = await page.evaluate((batchSize) => {
          const found: { name: string; strategy: string }[] = [];

          const sidebarSelectors = [
            'a[href*="/chat/"]',
            '[class*="chat-item"]',
            '[class*="conversation-item"]',
            '[class*="history-item"]',
            '[class*="sidebar"] a[href]',
            'aside a[href]',
            '[class*="ds-chat-item"]',
            '[class*="ds-chat-list"] > *',
            '[class*="sidebar"] [class*="item"]',
          ];

          let items: Element[] = [];
          for (const sel of sidebarSelectors) {
            const els = Array.from(document.querySelectorAll(sel));
            if (els.length > 1) {
              items = els;
              break;
            }
          }

          // Collect up to batchSize items from the end (newest first)
          for (let i = items.length - 1; i >= 0 && found.length < batchSize; i--) {
            const item = items[i];
            const deleteBtn =
              item.querySelector(
                '[class*="delete"], [class*="trash"], [class*="remove"], [class*="close"], [aria-label*="delete" i], [aria-label*="trash" i], [aria-label*="excluir" i], [aria-label*="apagar" i], [title*="Delete" i], [title*="Excluir" i]'
              ) ||
              item.parentElement?.querySelector(
                '[class*="delete"], [class*="trash"], [class*="remove"], [class*="close"]'
              );

            found.push({
              name: item.textContent?.trim().slice(0, 80) || "sem título",
              strategy: deleteBtn ? "delete-btn-found" : "hover-needed",
            });
          }

          return found;
        }, BATCH_SIZE);
      } catch {
        log("⚠️  Erro ao buscar conversas, recarregando...");
        emptyPasses++;
        try {
          await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        } catch {}
        await sleep(4000);
        continue;
      }

      if (batch.length === 0) {
        emptyPasses++;
        log("⚠️  Nenhuma conversa encontrada. Tentando refresh...");
        try {
          await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
        } catch {}
        await sleep(4000);
        continue;
      }

      log(`📦 Lote de ${batch.length} conversas coletado. Iniciando exclusão em lote...`);

      // Process batch: click delete on each item
      let batchDeletions = 0;
      for (const item of batch) {
        try {
          if (deleted >= MAX_DELETIONS) break;

          if (item.strategy === "hover-needed") {
            // Need to hover first to reveal delete button
            const hoverTarget = await page.evaluate((itemName) => {
              const sidebarSelectors = [
                'a[href*="/chat/"]',
                '[class*="chat-item"]',
                '[class*="conversation-item"]',
                '[class*="ds-chat-item"]',
              ];

              for (const sel of sidebarSelectors) {
                const els = Array.from(document.querySelectorAll(sel));
                for (const el of els) {
                  if (el.textContent?.trim().includes(itemName.slice(0, 30))) {
                    const rect = el.getBoundingClientRect();
                    return { x: rect.left + rect.width - 10, y: rect.top + rect.height / 2 };
                  }
                }
              }
              return null;
            }, item.name);

            if (hoverTarget) {
              await page.mouse.move(hoverTarget.x, hoverTarget.y);
              await sleep(600);
            }
          }

          // Click delete button
          const clicked = await page.evaluate(() => {
            const btn = document.querySelector(
              '[class*="delete"]:not([class*="hidden"]):not([style*="display: none"]), [class*="trash"]:not([style*="display: none"]), [aria-label*="delete" i], [aria-label*="excluir" i], [aria-label*="apagar" i], [title*="Delete" i], [title*="Excluir" i], button:has(svg)'
            );
            if (btn && btn.getBoundingClientRect().width > 0) {
              (btn as HTMLElement).click();
              return true;
            }
            const trashIcons = document.querySelectorAll("svg");
            for (const svg of trashIcons) {
              const html = svg.innerHTML.toLowerCase();
              if (html.includes("trash") || html.includes("delete") || html.includes("lixo")) {
                const btn = svg.closest("button") || svg.parentElement;
                if (btn && btn.getBoundingClientRect().width > 0) {
                  (btn as HTMLElement).click();
                  return true;
                }
              }
            }
            return false;
          });

          if (clicked) {
            await sleep(800);
            
            // Confirm deletion
            const confirmed = await page.evaluate(() => {
              const dialogs = document.querySelectorAll(
                '[class*="modal"], [class*="dialog"], [role="dialog"]'
              );
              for (const dialog of dialogs) {
                if (dialog.getBoundingClientRect().width > 0) {
                  const buttons = dialog.querySelectorAll("button");
                  for (const btn of buttons) {
                    const text = (btn.textContent || "").toLowerCase().trim();
                    if (
                      text === "delete" || text === "confirm" || text === "excluir" ||
                      text === "confirmar" || text === "sim" || text === "yes" || text === "deletar"
                    ) {
                      (btn as HTMLElement).click();
                      return true;
                    }
                  }
                  // Fallback: click last button (usually confirm)
                  if (buttons.length > 0) {
                    buttons[buttons.length - 1].click();
                    return true;
                  }
                }
              }
              return false;
            });

            if (confirmed) log("  ✓ Confirmação aceita");
            
            deleted++;
            batchDeletions++;
            log(`  ✅ [${deleted}/${batch.length}] "${item.name}" deletada`);
            await sleep(1200);
          } else {
            log(`  ⚠️  Botão não encontrado para "${item.name}"`);
          }
        } catch {
          log(`  ⚠️  Erro ao processar "${item.name}"`);
        }
      }

      if (batchDeletions === 0) {
        emptyPasses++;
        log("⚠️  Nenhuma conversa foi deletada neste lote.");
      } else {
        log(`📦 Lote concluído: ${batchDeletions}/${batch.length} deletadas`);
      }

      // Refresh to get updated list
      try {
        await page.goto(CHAT_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch {}
      await sleep(3000);
    }

    if (deleted === 0) {
      log("\n❌ Não foi possível deletar conversas.");
      log("");
      log("📋 Possíveis causas:");
      log("  • Você não possui conversas no histórico");
      log("  • A interface do DeepSeek mudou");
      log("  • A sessão expirou (execute npm run login:deepseek novamente)");
    } else {
  log(`\n✨ ${deleted} conversa(s) deletada(s) com sucesso!`);
    }
  } catch (err: any) {
    log("\n💥 Erro: " + err.message);
  } finally {
    await sleep(2000);
    await context.close();
    log("🔒 Navegador fechado.");
  }
}

main();
