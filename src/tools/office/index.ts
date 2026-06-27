import { registerTool } from "../registry.js";

function officeDef(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "function" as const,
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

export function registerOfficeTools(): void {
  registerTool(
    "revisar_contrato_juridico",
    officeDef(
      "revisar_contrato_juridico",
      "Analisa cláusulas abusivas em contrato PDF via IA jurídica",
      {
        documentUrl: { type: "string", description: "URL do PDF no Google Drive" },
      },
      ["documentUrl"]
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "revisar-contrato" }
  );

  registerTool(
    "gerar_relatorio_vendas",
    officeDef(
      "gerar_relatorio_vendas",
      "Gera relatório de vendas do período especificado",
      {
        periodo: { type: "string", description: "Ex: mensal, semanal, trimestral, anual" },
        dataInicio: { type: "string", description: "Data início ISO" },
        dataFim: { type: "string", description: "Data fim ISO" },
      },
      ["periodo"]
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "relatorio-vendas" }
  );

  registerTool(
    "enviar_notificacao_teams",
    officeDef(
      "enviar_notificacao_teams",
      "Envia notificação para canal do Microsoft Teams",
      {
        canal: { type: "string", description: "Nome do canal" },
        mensagem: { type: "string", description: "Texto da notificação" },
      },
      ["canal", "mensagem"]
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "notify-teams" }
  );

  registerTool(
    "buscar_cliente_crm",
    officeDef(
      "buscar_cliente_crm",
      "Busca dados de cliente no CRM por email ou CNPJ",
      {
        email: { type: "string", description: "Email do cliente" },
        cnpj: { type: "string", description: "CNPJ do cliente" },
      },
      []
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "buscar-cliente" }
  );

  registerTool(
    "agendar_reuniao",
    officeDef(
      "agendar_reuniao",
      "Agenda reunião no Google Calendar com participantes",
      {
        titulo: { type: "string", description: "Título da reunião" },
        dataHora: { type: "string", description: "Data/hora ISO" },
        participantes: { type: "array", items: { type: "string" }, description: "Emails dos participantes" },
        descricao: { type: "string", description: "Descrição opcional" },
      },
      ["titulo", "dataHora", "participantes"]
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "agendar-reuniao" }
  );

  registerTool(
    "consultar_planilha",
    officeDef(
      "consultar_planilha",
      "Consulta dados em uma Google Sheet. Ações disponíveis: list_columns (lista colunas), get_column (valores de uma coluna), get_row (valores de uma linha)",
      {
        acao: {
          type: "string",
          enum: ["list_columns", "get_column", "get_row"],
          description: "Ação a executar na planilha"
        },
        spreadsheetId: {
          type: "string",
          description: "ID da Google Sheet (extraído da URL)"
        },
        sheetName: {
          type: "string",
          description: "Nome da aba (padrão: Sheet1)"
        },
        column: {
          type: "string",
          description: "Letra da coluna (ex: A, B, C) - usado com get_column"
        },
        rowIndex: {
          type: "number",
          description: "Número da linha - usado com get_row"
        },
      },
      ["acao", "spreadsheetId"]
    ),
    async () => { throw new Error("Delegado ao n8n"); },
    { n8nWebhookPath: "google-sheets" }
  );
}