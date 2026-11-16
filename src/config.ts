export type ModelConfig = {
  apiKey: string;
  httpReferer: string;
  xTitle: string;
  models: string[];
  temperature: number;
};

export function readConfig(env = process.env) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  const operatorApiKey = env.OPERATOR_API_KEY?.trim();
  if (!apiKey || apiKey.startsWith('replace-')) {
    throw new Error('Configure OPENROUTER_API_KEY no ambiente.');
  }
  if (!operatorApiKey || operatorApiKey.length < 32 || operatorApiKey.length > 256 || /\s/.test(operatorApiKey) || operatorApiKey.startsWith('replace-')) {
    throw new Error('OPERATOR_API_KEY deve conter pelo menos 32 caracteres e não ser um placeholder.');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve ser um inteiro entre 1 e 65535.');
  }
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('HOST deve apontar para loopback nesta demonstração local.');
  }
  const model = env.OPENROUTER_MODEL?.trim();
  if (!model || model.startsWith('replace-')) throw new Error('Configure OPENROUTER_MODEL no ambiente.');
  return {
    operatorApiKey,
    host,
    port,
    model: {
      apiKey,
      httpReferer: '',
      xTitle: 'Agendamento Assistido LLM - Demonstração Acadêmica',
      models: [model],
      temperature: 0,
    } satisfies ModelConfig,
  };
}
