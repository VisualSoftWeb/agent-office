# Skills — Habilidades do Agente

A pasta `src/skills/` gerencia habilidades reutilizáveis que o agente pode aprender e reproduzir.

---

## loader.ts — Carregador de skills

- `loadSkills()` — escaneia a pasta `skills/` na raiz do projeto
- Lê arquivos `.md` e extrai nome e descrição
- Skills são arquivos markdown com formato específico:
  - `# skill: <nome>` — identificador
  - `## Description` — descrição do que faz
  - Conteúdo markdown com instruções

---

## generator.ts — Gerador automático de skills

- `recordToolSequence()` — registra sequências de ferramentas executadas repetidamente
- Quando atinge 5 sequências registradas, dispara `generateSkill()`
- Chama o LLM para analisar os padrões e gerar um arquivo `.md` de skill
- O LLM produz um skill.md com: descrição, trigger, steps e tool calls
- Skills geradas são salvas em `skills/skill-<nome>.md`
