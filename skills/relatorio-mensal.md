# skill: relatorio-mensal
## Description
Gerar relatório mensal consolidado com faturas emitidas, pagamentos recebidos e clientes atendidos. Cria planilha Excel formatada.

## Trigger
Usuário pede relatório mensal, relatório do mês, resumo financeiro, ou dashboard.

## Steps
1. Definir período (mês atual ou específico)
2. Buscar faturas do período com `listar_faturas`
3. Calcular totais: emitidas, pagas, pendentes, atrasadas
4. Criar planilha com `criar_planilha` contendo:
   - Aba "Resumo": totais e métricas
   - Aba "Faturas": detalhamento de cada fatura
   - Aba "Clientes": ranking por valor
5. Gerar também um PDF resumo com `criar_pdf`
6. Enviar ao usuário os arquivos gerados com `send_file`
