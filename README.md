# Agendamento assistido por LLM

Demonstração acadêmica de um workflow LangGraph que interpreta pedidos em português e agenda ou cancela consultas **fictícias**. A adaptação corrige validações, mensagens de falha, acesso HTTP e testes do exemplo de estudo.

O projeto deriva do módulo `03-medical-appointment-z` do curso de Engenharia de Software com IA Aplicada, de **Erick Wendel / Unipds**. Código e material originais: [repositório do curso](https://github.com/unipds-engenharia-de-ia-aplicada/engenharia-de-software-com-ia-aplicada).

## Workflow

```text
START → identifyIntent → schedule ou cancel → message → END
                       └─ unknown/erro ────→ message
```

O primeiro pedido ao modelo extrai intenção, médico, data e duração com um schema Zod. As arestas condicionais escolhem o nó. O serviço TypeScript valida e executa a ação em memória. O segundo pedido produz a mensagem com o resultado da ação.

`createAgent` usa `providerStrategy(schema)` e **`tools: []`**. As operações de agenda são chamadas pelo código dos nós; este exemplo **não implementa tool calling**. Saída estruturada restringe o formato, mas não garante intenção correta, datas corretas ou ausência de alucinações.

As falhas de ação chegam à geração em `details.error`, vindo de `actionError`. A resposta final de falha usa uma mensagem determinística, mesmo se o modelo tentar confirmar sucesso. Falha de identificação impede a mutação. Se apenas a redação falhar depois da mutação, a ação já realizada permanece registrada e a API devolve confirmação determinística com o campo `error` da redação.

## Execução local

Requer **Node.js >= 24.10.0** e npm. Não precisa de banco de dados.

```bash
npm ci
cp .env.example .env
# Edite .env com suas credenciais e um modelo compatível com saída estruturada.
npm start
```

Variáveis usadas:

| Variável | Uso |
| --- | --- |
| `OPENROUTER_API_KEY` | Credencial do provedor, apenas no ambiente local. |
| `OPENROUTER_MODEL` | Identificador explícito de um modelo compatível com structured output. |
| `OPERATOR_API_KEY` | Segredo aleatório do operador: 32 a 256 caracteres, sem espaços. |
| `HOST` | Padrão `127.0.0.1`. Somente loopback: `127.0.0.1`, `::1` ou `localhost`. |
| `PORT` | Padrão `3000`; inteiro entre 1 e 65535. |

Gere o segredo do operador localmente, por exemplo com `openssl rand -hex 32`, e salve-o em `.env`. Não envie credenciais ao repositório. `npm run dev` ativa reinício ao editar. O arquivo `langgraph.json` permite explorar o grafo localmente com a CLI opcional, instalada sob demanda por `npm run langgraph:serve`; essa exploração é acesso direto de desenvolvimento e não passa pela autenticação HTTP.

Chamadas reais enviam o pedido ao OpenRouter e podem gerar cobrança. Confira o modelo e as condições do provedor antes de executar. O cliente limita cada chamada a 30 segundos e desativa tentativas automáticas.

## API de operador

`POST /chat` exige `Authorization: Bearer <OPERATOR_API_KEY>`. Essa chave autoriza **um operador da demonstração** a selecionar um paciente fictício. Não há login multiusuário, autenticação de paciente, prova de identidade do paciente ou separação entre operadores.

O campo `patientId` é obrigatório e fornecido pelo operador fora do prompt. Só aceita `paciente-demo-001` e `paciente-demo-002`. Os nomes `Paciente Fictício Um` e `Paciente Fictício Dois` vêm dessas fixtures. Médicos e especialidades também são fixtures fictícias. Nomes escritos na pergunta não autorizam cancelamento nem substituem o paciente selecionado.

Para o exemplo abaixo, defina `OPERATOR_API_KEY` no ambiente do terminal com o mesmo valor de `.env`. O carregamento de `.env` pelo Node não exporta a variável para o shell. Troque a data por uma data futura.

```bash
curl http://127.0.0.1:3000/chat \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $OPERATOR_API_KEY" \
  --data '{"patientId":"paciente-demo-001","question":"Agende uma consulta fictícia com o médico de ID 1 em 2030-01-02 às 10:00 UTC, por 30 minutos."}'
```

Para cancelar, mantenha o `patientId` e peça explicitamente o cancelamento do mesmo médico, data e horário. O cancelamento verifica a existência de agendamento desse paciente; conhecer ou escrever um nome no prompt não basta. O operador autenticado pode selecionar qualquer uma das duas fixtures: isto não representa autorização de um paciente real.

O corpo aceita apenas `question` e `patientId`. A pergunta deve ter de 10 a 4000 caracteres e conter texto. A resposta contém `intent`, `actionSuccess`, `message`, e, quando aplicável, `appointment` ou `error`. `actionSuccess` descreve o resultado real da ação; o texto gerado não deve ser usado como autorização ou como fonte de estado.

Códigos: `200` para ação concluída ou intenção desconhecida, `400` para corpo inválido, `401` para chave ausente/inválida, `422` para ação recusada e `502` para falha do modelo que impede a ação. Falha apenas na redação após ação concluída mantém `200`, `actionSuccess: true`, confirmação determinística e `error`. Erros inesperados do handler retornam `500` sem detalhes internos.

## Regras da agenda fictícia

- O médico deve existir na lista de três profissionais em `appointmentService.ts`.
- A data deve existir no calendário, ser futura e chegar aos nós em ISO 8601 com timezone explícito. Datas sem timezone são rejeitadas. O prompt orienta UTC quando o pedido omite fuso.
- Cada consulta dura exatamente **30 minutos**. Outra duração explícita é recusada.
- O expediente simplificado é **08:00 a 18:00 UTC, todos os dias**, sem calendário de feriados. A consulta inteira deve caber nesse intervalo. O último início é 17:30 UTC. Segundos e milissegundos devem ser zero.
- Sobreposição e duplicidade são bloqueadas para o mesmo médico, inclusive inícios diferentes dentro do intervalo ocupado. Horários adjacentes são aceitos. Não há regra de conflito entre médicos diferentes para o mesmo paciente.
- O cancelamento exige contexto do operador, `patientId` válido e correspondência exata de médico, paciente e instante futuro. Agendamento inexistente não é sucesso.

São regras mínimas de programação para estudo. Não há avaliação clínica, encaminhamento, aconselhamento médico ou integração com uma agenda real.

## Testes

```bash
npm test
npm run typecheck
```

A suíte padrão é determinística, não carrega `.env`, não chama modelos e não possui testes pulados. Usa `node:test`, `Fastify.inject` e respostas controladas do gerador. Cobre falha real do cliente com transporte bloqueado, erros no workflow, mensagens de ação, datas inválidas, médico inexistente, duração, expediente, duplicidade, sobreposição, cancelamento e autenticação HTTP.

Verificação local da adaptação: **18 testes aprovados**, nenhum pulado, e `npm run typecheck` sem erros, com Node.js 24.11.1 e TypeScript 7.0.2. O compilador está declarado nas dependências de desenvolvimento e instalado por `npm ci`.

O teste de integração externo fica separado. Ele exige autorização explícita por variável e faz duas chamadas ao provedor; pode consumir créditos. Não agenda nem cancela consultas. **Não é executado por `npm test`.**

```bash
RUN_PAID_E2E=1 npm run test:e2e
```

O teste externo não foi executado na verificação desta adaptação; nenhuma chamada paga foi feita. O teste falha antes de chamar o provedor se a autorização explícita estiver ausente. Não há garantia de execução com qualquer modelo ou de disponibilidade do provedor.

## Limites

Os agendamentos começam vazios e existem somente na memória de uma instância. Reiniciar perde os dados. A verificação e a gravação são síncronas nesse processo; não há persistência, transações distribuídas, proteção entre réplicas ou chave de idempotência HTTP. Repetir um pedido pode repetir chamadas ao modelo; a regra de conflito bloqueia uma segunda reserva do mesmo intervalo.

O modelo pode interpretar incorretamente um pedido autorizado. Não há etapa de confirmação humana adicional. Use somente fixtures e pedidos de teste, nunca dados pessoais ou clínicos reais. O pedido e detalhes fictícios podem sair da máquina para o provedor. O HTTP fica restrito a loopback; faltam controles de produção como login por usuário, autorização por recurso, auditoria, rate limit, teto de gastos e política de privacidade. O timeout é por chamada ao modelo; não há prazo total próprio para o processamento do workflow. Não exponha a demonstração como serviço de saúde.

## Créditos e licença

Autoria original preservada: **Erick Wendel / Unipds**. Esta versão de estudo modifica validação, segurança da demonstração, tratamento de erros, testes e documentação; não implica endosso dos autores originais.

A [LICENSE.md](LICENSE.md) original foi mantida integralmente: **CC BY-NC-ND 4.0**, com suas condições e restrições. O projeto não é licenciado como MIT. Consulte o texto original para condições de uso e distribuição.
