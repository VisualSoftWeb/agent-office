# Plano de Refatoração: Abstração Unificada (Multi-Provider)

Este documento descreve o plano para refatorar o QwenProxy e suportar múltiplos provedores de chat (como Gemini, Claude, Qwen, etc.) em um único projeto, utilizando uma interface padrão e roteamento dinâmico.

## 📋 Fases de Implementação

### Fase 1: Definição da Abstração Core
- **Ação**: Criar `src/core/provider.ts`.
- **Detalhe**: Definir a interface `IChatProvider` com métodos padronizados, como `createCompletion(request: ChatRequest): Promise<ChatResponse | ReadableStream>` e `listModels(): Promise<Model[]>`. Isso garante que qualquer provedor siga o mesmo contrato.

### Fase 2: Isolamento da Lógica do Qwen
- **Ação**: Criar `src/providers/qwen-provider.ts` e refatorar `src/services/qwen.ts`.
- **Detalhe**: Mover toda a lógica específica do Qwen (automação Playwright, *warm pool*, formatação de payload, tratamento de desafios TMD) para a classe `QwenProvider`, que implementará `IChatProvider`. O gerenciador de contas (`account-manager.ts`) será acoplado a este provedor, isolando o estado do Qwen dos demais.

### Fase 3: Roteamento Dinâmico
- **Ação**: Criar `src/core/provider-registry.ts` e refatorar `src/routes/chat.ts`.
- **Detalhe**: O registro mapeará nomes de modelos (ex: `qwen-plus` → `QwenProvider`, `gemini-1.5-pro` → `GeminiProvider`). O `chat.ts` será simplificado: ele lerá o `model` da requisição, buscará o provedor correto no registro e delegará a execução, tratando o retorno de forma padronizada para o cliente OpenAI.

### Fase 4: Validação com Novo Provedor
- **Ação**: Criar `src/providers/gemini-provider.ts`.
- **Detalhe**: Implementar um provedor de exemplo para validar a arquitetura. Ele demonstrará como é simples adicionar um novo serviço sem tocar no código central.

---

## ❓ Perguntas de Alinhamento (Aguardando Resposta)

Antes de iniciar a codificação, precisamos definir os seguintes pontos:

1. **Método de Acesso ao Novo Provedor (ex: Gemini)**:  
   Você prefere que a implementação inicial do Gemini seja via **API Oficial** (mais estável, requer chave de API, sem Playwright) ou via **Automação de Navegador** (para manter o padrão de uso de "contas gratuitas", semelhante ao Qwen atual)?

2. **Gerenciamento de Contas (SQLite)**:  
   Deseja que o sistema de contas no SQLite seja **genérico** (suportando credenciais de qualquer provedor em uma única tabela com uma coluna `provider`) ou **específico** (mantendo a lógica atual focada apenas no Qwen, e outros provedores usando apenas chaves de API no `.env`)?

---

*Próximos passos: Aguardando suas respostas para refinarmos o plano e iniciar a implementação.*