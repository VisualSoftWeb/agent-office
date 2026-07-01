# skill: gerar-fatura
## Description
Gerar fatura completa para um cliente: cadastra no sistema, gera PDF profissional e opcionalmente envia por email.

## Trigger
Usuário pede para gerar fatura, nota de cobrança, boleto, ou invoice.

## Steps
1. Buscar cliente no CRM com `buscar_cliente` (ou criar com `criar_cliente` se não existir)
2. Coletar: número da fatura, descrição do serviço, valor, data de vencimento
3. Criar fatura com `criar_fatura` (salvar PDF)
4. Se email do cliente estiver disponível e usuário autorizar, enviar com `enviar_email`
5. Informar resumo: fatura gerada, valor, vencimento, status
