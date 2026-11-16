import { timingSafeEqual } from 'node:crypto';
import { HumanMessage } from 'langchain';
import Fastify from 'fastify';
import { buildGraph } from './graph/factory.ts';
import { readConfig } from './config.ts';
import { patients } from './services/appointmentService.ts';

export const createServer = ({
  operatorApiKey = readConfig().operatorApiKey,
  graph = buildGraph(),
} = {}) => {
  if (operatorApiKey.length < 32 || operatorApiKey.length > 256 || /\s/.test(operatorApiKey) || operatorApiKey.startsWith('replace-')) {
    throw new Error('Chave de operador inválida.');
  }
  const expected = Buffer.from(`Bearer ${operatorApiKey}`);
  const app = Fastify({
    bodyLimit: 16_384,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  app.addHook('onRequest', async (request, reply) => {
    const received = Buffer.from(request.headers.authorization ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return reply.code(401).send({ error: 'Operador não autorizado.' });
    }
  });
  app.post('/chat', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'patientId'],
        properties: {
          question: { type: 'string', minLength: 10, maxLength: 4000, pattern: '\\S' },
          patientId: { type: 'string', enum: patients.map(patient => patient.id) },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { question, patientId } = request.body as { question: string; patientId: string };
      const response = await graph.invoke({
        messages: [new HumanMessage(question)],
        operatorAuthorized: true,
        operatorPatientId: patientId,
      });
      const error = response.actionError ?? response.error;
      return reply.code(response.error && !response.actionSuccess ? 502 : response.actionError ? 422 : 200).send({
        intent: response.intent,
        actionSuccess: response.actionSuccess === true,
        message: response.messages.at(-1)?.text,
        appointment: response.appointmentData,
        ...(error ? { error } : {}),
      });
    } catch {
      return reply.code(500).send({ error: 'Falha ao processar a solicitação.' });
    }
  });
  return app;
};
