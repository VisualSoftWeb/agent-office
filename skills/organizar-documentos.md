# skill: organizar-documentos
## Description
Organizar documentos de um cliente ou projeto em pastas estruturadas. Cria estrutura de pastas e move/renomeia arquivos.

## Trigger
Usuário pede para organizar arquivos, criar estrutura de pastas, ou arrumar documentos.

## Steps
1. Perguntar nome do cliente/projeto
2. Criar estrutura de pastas com `criar_pasta`:
   - `$Documentos\\[Cliente]\\Contratos\\`
   - `$Documentos\\[Cliente]\\Faturas\\`
   - `$Documentos\\[Cliente]\\Correspondencia\\`
   - `$Documentos\\[Cliente]\\Outros\\`
3. Listar arquivos existentes com `listar_pasta`
4. Sugerir movimentação de arquivos para as pastas corretas
5. Executar movimentação com `renomear_arquivo` após confirmação
6. Gerar índice da organização com `criar_planilha`
