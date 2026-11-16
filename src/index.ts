import { createServer } from './server.ts';
import { readConfig } from './config.ts';

const { host, port, operatorApiKey } = readConfig();
const app = createServer({ operatorApiKey });
await app.listen({ port, host });
console.log(`Demonstração local disponível em http://${host}:${port}`);
