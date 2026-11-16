import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.ts';
import { readConfig } from '../src/config.ts';
import { AppointmentService } from '../src/services/appointmentService.ts';
import { buildAppointmentGraph } from '../src/graph/graph.ts';
import { fakeLLM } from './support.ts';

const apiKey = 'test-only-operator-key-with-32-characters';
const headers = { authorization: `Bearer ${apiKey}` };
const payload = { question: 'Agendar uma consulta fictícia', patientId: 'paciente-demo-001' };
const now = Date.parse('2030-01-01T00:00:00Z');
const intent = { intent: 'schedule', professionalId: 1, datetime: '2030-01-02T10:00:00Z' };

it('HTTP exige chave de operador antes de chamar o workflow', async t => {
  const llm = fakeLLM([]);
  const app = createServer({ operatorApiKey: apiKey, graph: buildAppointmentGraph(llm, new AppointmentService(() => now)) });
  t.after(() => app.close());
  for (const authorization of [undefined, 'Bearer inválida', apiKey]) {
    const response = await app.inject({ method: 'POST', url: '/chat', headers: authorization ? { authorization } : {}, payload });
    assert.equal(response.statusCode, 401);
    assert.match(response.json().error, /Operador não autorizado/);
  }
  assert.equal(llm.prompts.length, 0);
});

it('HTTP valida input, paciente fictício e recusa contexto de autorização no corpo', async t => {
  const llm = fakeLLM([]);
  const app = createServer({ operatorApiKey: apiKey, graph: buildAppointmentGraph(llm, new AppointmentService(() => now)) });
  t.after(() => app.close());
  for (const invalid of [
    { question: payload.question },
    { ...payload, patientId: 'desconhecido' },
    { ...payload, question: 12345 },
    { ...payload, question: 'curta' },
    { ...payload, question: ' '.repeat(20) },
    { ...payload, question: 'a'.repeat(4001) },
    { ...payload, operatorAuthorized: true },
  ]) {
    const response = await app.inject({ method: 'POST', url: '/chat', headers, payload: invalid });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(llm.prompts.length, 0);
});

it('HTTP agenda, rejeita duplicidade e cancela somente paciente informado pelo operador', async t => {
  const llm = fakeLLM([
    intent, { message: 'Agendamento fictício realizado.' },
    intent, { message: 'Consulta confirmada com sucesso.' },
    { ...intent, intent: 'cancel' }, { message: 'Cancelado com sucesso na demonstração.' },
    { ...intent, intent: 'cancel' }, { message: 'Cancelamento fictício realizado.' },
  ]);
  const app = createServer({ operatorApiKey: apiKey, graph: buildAppointmentGraph(llm, new AppointmentService(() => now)) });
  t.after(() => app.close());
  const first = await app.inject({ method: 'POST', url: '/chat', headers, payload });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().actionSuccess, true);
  assert.equal(first.json().appointment.patientId, payload.patientId);
  assert.equal(first.json().operatorAuthorized, undefined);
  const duplicate = await app.inject({ method: 'POST', url: '/chat', headers, payload });
  assert.equal(duplicate.statusCode, 422);
  assert.equal(duplicate.json().actionSuccess, false);
  assert.match(duplicate.json().message, /Nenhuma ação realizada.*indisponível/);
  const wrongPatient = await app.inject({ method: 'POST', url: '/chat', headers, payload: { ...payload, patientId: 'paciente-demo-002' } });
  assert.equal(wrongPatient.statusCode, 422);
  assert.equal(wrongPatient.json().actionSuccess, false);
  const cancelled = await app.inject({ method: 'POST', url: '/chat', headers, payload });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelled.json().actionSuccess, true);
});

it('HTTP retorna 502 quando identificação LLM falha, sem anunciar ação realizada', async t => {
  const llm = fakeLLM([new Error('detalhes privados'), { message: 'Sua consulta foi confirmada.' }]);
  const app = createServer({ operatorApiKey: apiKey, graph: buildAppointmentGraph(llm, new AppointmentService(() => now)) });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/chat', headers, payload });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().actionSuccess, false);
  assert.match(response.json().message, /Nenhuma ação realizada/);
  assert.doesNotMatch(response.body, /detalhes privados/);
});

it('configuração exige segredos, modelo explícito, porta válida e loopback', () => {
  const valid = { OPENROUTER_API_KEY: 'test-only', OPENROUTER_MODEL: 'test/model', OPERATOR_API_KEY: apiKey };
  assert.equal(readConfig(valid).host, '127.0.0.1');
  assert.equal(readConfig(valid).port, 3000);
  for (const invalid of [
    {}, { ...valid, OPENROUTER_API_KEY: '' }, { ...valid, OPENROUTER_API_KEY: 'replace-placeholder' },
    { ...valid, OPERATOR_API_KEY: 'curta' }, { ...valid, OPENROUTER_MODEL: '' },
    { ...valid, OPENROUTER_MODEL: 'replace-placeholder' }, { ...valid, OPERATOR_API_KEY: 'a'.repeat(300) },
    { ...valid, HOST: '0.0.0.0' }, { ...valid, PORT: '0' }, { ...valid, PORT: 'abc' },
    { ...valid, PORT: '65536' },
  ]) assert.throws(() => readConfig(invalid));
});
