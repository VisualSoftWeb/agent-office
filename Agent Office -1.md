Quero construir um agente de IA pessoal em TypeScript, rodando no Telegram. Estas são as features que escolhi (em ordem das trilhas do curso):

- Bot do Telegram: O canal por onde você fala com o agente. Cria via @BotFather, pega o token e conecta.
- Chave de modelo (LLM): A credencial pra falar com Claude, GPT, DeepSeek ou Ollama local. Pode trocar a quente.
- Bootstrap do projeto: Node 20+, TypeScript, package.json, estrutura de pastas e o primeiro "olá mundo".
- Personalidade (soul.md): Um arquivo Markdown que define tom, regras, o que ele faz e o que recusa fazer.
- Memória de curto prazo: Buffer SQLite das últimas N mensagens + fatos centrais sobre você (nome, fuso, metas).
- Memória semântica (vetorial): Indexa todo histórico em vetores (Pinecone ou local) e recupera por similaridade, não por recência.
- Camada de LLM trocável: Abstração que deixa você trocar Claude por GPT por DeepSeek mudando uma variável.
- Sistema de ferramentas: O contrato JSON Schema que deixa o LLM chamar funções suas (ler arquivo, buscar web, etc).
- Loop do agente: Receber → pensar → chamar ferramenta → ler resultado → repetir até finalizar.
- Heartbeat (cron autônomo): Cron que dispara o agente sem você mandar mensagem ("toda 8h, resumir email").
- Streaming de respostas: Edita a mensagem do Telegram em tempo real conforme o LLM gera, em vez de esperar tudo.
- Voz (entrada e saída): Você manda áudio no Telegram, ele transcreve, processa e pode até responder em áudio.
- Reflexão noturna: Todo dia o agente relê conversas recentes e consolida em fatos centrais ("o usuário prefere X").
- Skills auto-geradas: Depois de 5+ tool calls numa tarefa, o agente escreve um arquivo skill.md pra repetir mais rápido.
- Multi-usuário: Mesmo agente atende várias pessoas, com memória separada por usuário.
- Servidores MCP: Protocolo padrão (Model Context Protocol) — plugue centenas de integrações prontas (Notion, GitHub, etc).
- Aprovações de ações: Antes de ações destrutivas (deletar arquivo, mandar email), o agente pergunta com botões inline.
- Defesa contra prompt injection: Marca outputs de ferramenta com tags pro LLM não confundir com instruções do usuário.
- Rastreamento de custos: Loga tokens por conversa, calcula custo em USD/dia, alerta se passar de limite.
- Dashboard de controle: Mini app web pra ver conversas, custos, skills, memória — tudo do agente em um lugar.
- Hospedagem 24/7: Roda no Railway, Docker, VPS ou systemd — não dependendo do seu laptop ligado.
- Testes automatizados: Suite de testes pras peças críticas (memória, tool calls, loop) — pra refatorar com confiança.

Prossiga assim:
1. Liste a estrutura de pastas e arquivos que vai criar
2. Confirme comigo antes de começar
3. Implemente módulo por módulo, mostrando cada arquivo
4. No final, me dê o comando pra rodar localmente

Use boas práticas de TypeScript, .env pra segredos, e commit incremental no git.