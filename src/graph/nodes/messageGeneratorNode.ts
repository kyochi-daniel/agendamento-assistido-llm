import { getSystemPrompt, getUserPromptTemplate, MessageSchema } from '../../prompts/v1/messageGenerator.ts';
import type { StructuredGenerator } from '../../services/openRouterService.ts';
import type { GraphState } from '../graph.ts';
import { AIMessage } from 'langchain';

export function createMessageGeneratorNode(llmClient: StructuredGenerator) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const failure = state.actionError ?? state.error;
    const succeeded = state.actionSuccess === true && !failure;
    const scenario = state.intent === 'unknown' ? 'unknown' : `${state.intent}_${succeeded ? 'success' : 'error'}`;
    const details = {
      professionalName: state.professionalName,
      datetime: state.datetime,
      patientName: state.patientName,
      error: failure,
    };
    const fallback = succeeded
      ? `${state.intent === 'cancel' ? 'Cancelamento' : 'Agendamento'} realizado para ${state.patientName}, com ${state.professionalName}, em ${state.datetime}.`
      : `Nenhuma ação realizada. ${failure ?? 'Informe se deseja agendar ou cancelar uma consulta fictícia.'}`;
    try {
      const result = await llmClient.generateStructured(getSystemPrompt(), getUserPromptTemplate({ scenario, details }), MessageSchema);
      if (!result.success) {
        return { messages: [new AIMessage(fallback)], error: state.error ?? 'Falha ao gerar a mensagem.' };
      }
      const message = MessageSchema.parse(result.data).message;
      // A falha da ação é autoritativa, mesmo que o modelo tente confirmar um sucesso.
      return { messages: [new AIMessage(succeeded ? message : fallback)] };
    } catch {
      return { messages: [new AIMessage(fallback)], error: state.error ?? 'Falha ao gerar a mensagem.' };
    }
  };
}
