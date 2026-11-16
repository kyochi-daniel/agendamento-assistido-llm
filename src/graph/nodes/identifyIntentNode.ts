import { getSystemPrompt, getUserPromptTemplate, IntentSchema } from '../../prompts/v1/identifyIntent.ts';
import { professionals } from '../../services/appointmentService.ts';
import type { StructuredGenerator } from '../../services/openRouterService.ts';
import type { GraphState } from '../graph.ts';

export function createIdentifyIntentNode(llmClient: StructuredGenerator) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      const input = state.messages.at(-1)?.text;
      if (!input) throw new Error('Pergunta não informada.');
      const result = await llmClient.generateStructured(
        getSystemPrompt(professionals), getUserPromptTemplate(input), IntentSchema,
      );
      if (!result.success) {
        return { intent: 'unknown', actionSuccess: false, error: 'Não foi possível identificar a solicitação.' };
      }
      // Somente campos do schema podem voltar do modelo; contexto do operador permanece fora do prompt.
      return { ...IntentSchema.parse(result.data), actionSuccess: false, actionError: undefined, error: undefined };
    } catch {
      return { intent: 'unknown', actionSuccess: false, error: 'Não foi possível identificar a solicitação.' };
    }
  };
}
