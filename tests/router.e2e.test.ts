import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.ts';
import { readConfig } from '../src/config.ts';

it('integração opcional com OpenRouter: intenção desconhecida sem alterar agenda', async t => {
  assert.equal(process.env.RUN_PAID_E2E, '1', 'Este teste chama uma API externa. Autorize explicitamente com RUN_PAID_E2E=1.');
  const { operatorApiKey } = readConfig();
  const app = createServer();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST', url: '/chat',
    headers: { authorization: `Bearer ${operatorApiKey}` },
    payload: { question: 'Qual é a previsão do tempo para amanhã?', patientId: 'paciente-demo-001' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().intent, 'unknown');
  assert.equal(response.json().actionSuccess, false);
  assert.equal(response.json().error, undefined);
  assert.equal(typeof response.json().message, 'string');
});
