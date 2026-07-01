import nodemailer from "nodemailer";
import { config } from "../../config.js";
import { registerTool } from "../registry.js";

// ── enviar_email ──
registerTool("enviar_email", {
  type: "function",
  function: {
    name: "enviar_email",
    description: "Enviar email via SMTP. Requer configuração SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS no .env",
    parameters: {
      type: "object",
      properties: {
        para: { type: "string", description: "Email do destinatário (ou múltiplos separados por vírgula)" },
        assunto: { type: "string", description: "Assunto do email" },
        corpo: { type: "string", description: "Corpo do email (texto ou HTML)" },
        html: { type: "boolean", description: "Se true, o corpo é tratado como HTML" },
        anexos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              caminho: { type: "string" },
              nome: { type: "string" },
            },
          },
          description: "Anexos (caminho do arquivo + nome opcional)",
        },
      },
      required: ["para", "assunto", "corpo"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const to = String(args.para ?? "").trim();
  const subject = String(args.assunto ?? "").trim();
  const body = String(args.corpo ?? "");
  const isHtml = Boolean(args.html);

  if (!to) return "Destinatário é obrigatório.";
  if (!subject) return "Assunto é obrigatório.";

  const smtpHost = config.SMTP_HOST;
  const smtpPort = Number(config.SMTP_PORT ?? 587);
  const smtpUser = config.SMTP_USER;
  const smtpPass = config.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return "SMTP não configurado. Adicione SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no .env";
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const mailOptions: nodemailer.SendMailOptions = {
      from: smtpUser,
      to,
      subject,
      [isHtml ? "html" : "text"]: body,
    };

    if (args.anexos && Array.isArray(args.anexos)) {
      mailOptions.attachments = args.anexos.map((a: { caminho: string; nome?: string }) => ({
        filename: a.nome ?? a.caminho.split(/[/\\]/).pop(),
        path: a.caminho,
      }));
    }

    const info = await transporter.sendMail(mailOptions);
    return `Email enviado com sucesso!\nDestinatário: ${to}\nAssunto: ${subject}\nID: ${info.messageId}`;
  } catch (err) {
    return `Erro ao enviar email: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── notificar_teams ──
registerTool("notificar_teams", {
  type: "function",
  function: {
    name: "notificar_teams",
    description: "Enviar notificação para um canal do Microsoft Teams via Incoming Webhook URL.",
    parameters: {
      type: "object",
      properties: {
        webhook_url: { type: "string", description: "URL do Incoming Webhook do Teams" },
        titulo: { type: "string", description: "Título da notificação" },
        mensagem: { type: "string", description: "Texto da mensagem" },
        cor: { type: "string", description: "Cor em hex (ex: #FF0000). Padrão: #0076D7" },
      },
      required: ["webhook_url", "mensagem"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const webhookUrl = String(args.webhook_url ?? "").trim();
  const title = String(args.titulo ?? "Notificação do Agente");
  const message = String(args.mensagem ?? "");
  const color = String(args.cor ?? "#0076D7").replace("#", "");

  if (!webhookUrl) return "URL do webhook é obrigatória.";
  if (!message) return "Mensagem é obrigatória.";

  try {
    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: color,
      summary: title,
      sections: [{
        activityTitle: title,
        text: message,
        markdown: true,
      }],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return `Erro ao enviar para Teams: HTTP ${response.status}`;
    }

    return `Notificação enviada para Teams com sucesso!`;
  } catch (err) {
    return `Erro ao notificar Teams: ${err instanceof Error ? err.message : String(err)}`;
  }
});
