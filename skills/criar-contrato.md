# skill: criar-contrato
## Description
Criar um contrato profissional a partir de dados do cliente e termos fornecidos. Gera documento Word (.docx) formatado com cláusulas padrão.

## Trigger
Usuário pede para criar contrato, minuta de contrato, acordo, ou documento jurídico.

## Steps
1. Buscar dados do cliente no CRM usando `buscar_cliente`
2. Coletar informações faltantes (tipo de contrato, valor, prazo, condições)
3. Montar estrutura do contrato com: preâmbulo, cláusulas, assinaturas
4. Criar documento Word com `criar_documento`
5. Salvar em pasta organizada (ex: $Documentos\\Contratos\\)
6. Informar ao usuário o caminho do arquivo gerado
