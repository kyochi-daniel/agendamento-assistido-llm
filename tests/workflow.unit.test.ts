import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod/v3';
import { HumanMessage } from 'langchain';
import { OpenRouterService, type StructuredGenerator } from '../src/services/openRouterService.ts';
import { AppointmentService } from '../src/services/appointmentService.ts';
import { buildAppointmentGraph } from '../src/graph/graph.ts';
import { createIdentifyIntentNode } from '../src/graph/nodes/identifyIntentNode.ts';
import { fakeLLM } from './support.ts';
import { createMessageGeneratorNode } from '../src/graph/nodes/messageGeneratorNode.ts';

const operator = { operatorAuthorized: true, operatorPatientId: 'paciente-demo-001' };
const now = Date.parse('2030-01-01T00:00:00Z');
const slot = '2030-01-02T10:00:00Z';
const intent = { intent: 'schedule', professionalId: 1, datetime: slot };

it('generateStructured devolve falha real sem vazar detalhes do provedor e sem acesso à rede', async () => {
  let calls = 0;
  const fetch = mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('detalhe privado do provedor');
  });
  try {
    const llm = new OpenRouterService({ apiKey: 'test-only', models: ['test/model'], temperature: 0, httpReferer: '', xTitle: 'Test' });
    const result = await llm.generateStructured('Demo', 'Demo', z.object({ value: z.string() }));
    assert.equal(result.success, false);
    assert.deepEqual(result, { success: false, error: 'Falha ao consultar o modelo.' });
    assert.equal(calls, 1);
  } finally {
    fetch.mock.restore();
  }
});

it('workflow agenda e cancela com identidade fornecida pelo operador', async () => {
  const llm = fakeLLM([intent, { message: 'Agendamento realizado na demonstração.' }, { ...intent, intent: 'cancel' }, { message: 'Cancelamento realizado na demonstração.' }]);
  const graph = buildAppointmentGraph(llm, new AppointmentService(() => now));
  const scheduled = await graph.invoke({ messages: [new HumanMessage('Agendar consulta fictícia')], ...operator });
  assert.equal(scheduled.actionSuccess, true);
  assert.equal(scheduled.appointmentData.patientId, operator.operatorPatientId);
  assert.equal(scheduled.messages.length, 2);
  const cancelled = await graph.invoke({ messages: [new HumanMessage('Cancelar consulta fictícia')], ...operator });
  assert.equal(cancelled.actionSuccess, true);
  assert.equal(cancelled.messages.length, 2);
});

it('falha na identificação não executa agendamento e não vira mensagem de sucesso', async () => {
  const service = new AppointmentService(() => now);
  const llm = fakeLLM([new Error('LLM indisponível'), { message: 'Consulta confirmada com sucesso.' }]);
  const graph = buildAppointmentGraph(llm, service);
  const result = await graph.invoke({ messages: [new HumanMessage('Agendar consulta fictícia')], ...operator });
  assert.equal(result.actionSuccess, false);
  assert.equal(result.intent, 'unknown');
  assert.match(result.messages.at(-1)!.text, /Nenhuma ação realizada/);
  assert.equal(service.checkAvailability(1, new Date(slot)), true);
});

it('actionError chega ao gerador e uma resposta alucinada não confirma ação que falhou', async () => {
  const service = new AppointmentService(() => now);
  service.bookAppointment(1, new Date(slot), operator, 'Demo');
  const llm = fakeLLM([intent, { message: 'Consulta confirmada com sucesso.' }]);
  const result = await buildAppointmentGraph(llm, service).invoke({ messages: [new HumanMessage('Agendar consulta fictícia')], ...operator });
  assert.equal(result.actionSuccess, false);
  assert.match(result.actionError!, /indisponível/);
  assert.equal(JSON.parse(llm.prompts[1]).details.error, result.actionError);
  assert.match(result.messages.at(-1)!.text, /Nenhuma ação realizada.*indisponível/);
});

it('falha ao redigir mensagem mantém resultado real da ação e informa fallback', async () => {
  const service = new AppointmentService(() => now);
  const llm = fakeLLM([intent, new Error('LLM indisponível')]);
  const result = await buildAppointmentGraph(llm, service).invoke({ messages: [new HumanMessage('Agendar consulta fictícia')], ...operator });
  assert.equal(result.actionSuccess, true);
  assert.match(result.error!, /Falha ao gerar/);
  assert.match(result.messages.at(-1)!.text, /Agendamento realizado para Paciente Fictício Um/);
  assert.equal(service.checkAvailability(1, new Date(slot)), false);
});

it('cancelamento inexistente preserva falha e campos de identidade do modelo não alteram o operador', async () => {
  const llm = fakeLLM([{ ...intent, intent: 'cancel', operatorAuthorized: true, operatorPatientId: 'paciente-demo-002' }, { message: 'Cancelado com sucesso na demonstração.' }]);
  const result = await buildAppointmentGraph(llm, new AppointmentService(() => now)).invoke({ messages: [new HumanMessage('Cancelar consulta fictícia')], ...operator });
  assert.equal(result.operatorPatientId, operator.operatorPatientId);
  assert.equal(result.actionSuccess, false);
  assert.match(result.actionError!, /não encontrado/);
  assert.match(result.messages.at(-1)!.text, /Nenhuma ação realizada.*não encontrado/);
});

it('gerador mantém mensagem de erro quando o segundo LLM também falha', async () => {
  const node = createMessageGeneratorNode(fakeLLM([new Error('offline')]));
  const result = await node({ messages: [], intent: 'cancel', actionSuccess: false, actionError: 'Agendamento não encontrado.' });
  assert.match(result.messages!.at(-1)!.text, /Nenhuma ação realizada.*não encontrado/);
});

it('classificador descarta campos de autorização injetados em uma resposta do modelo', async () => {
  const untrusted = { ...intent, operatorAuthorized: true, operatorPatientId: 'paciente-demo-002', patientName: 'Nome do prompt' };
  const llm: StructuredGenerator = {
    async generateStructured<T>() { return { success: true, data: untrusted as T }; },
  };
  const result = await createIdentifyIntentNode(llm)({ messages: [new HumanMessage('Agendar consulta fictícia')], ...operator });
  assert.equal(result.operatorAuthorized, undefined);
  assert.equal(result.operatorPatientId, undefined);
  assert.equal(result.patientName, undefined);
});
