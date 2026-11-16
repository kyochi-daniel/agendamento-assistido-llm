import { AppointmentService, professionals } from '../../services/appointmentService.ts';
import type { GraphState } from '../graph.ts';
import { z } from 'zod/v3';

const CancelRequiredFieldsSchema = z.object({
  professionalId: z.number().int().positive(),
  datetime: z.string().datetime({ offset: true }),
});

export function createCancellerNode(appointmentService: AppointmentService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      const validation = CancelRequiredFieldsSchema.safeParse(state);
      if (!validation.success) {
        return { actionSuccess: false, actionError: 'Informe profissional e data ISO válida para cancelar.' };
      }
      const { professionalId, datetime } = validation.data;
      const appointment = appointmentService.cancelAppointment(professionalId, new Date(datetime), state);
      return {
        actionSuccess: true,
        actionError: undefined,
        appointmentData: appointment,
        datetime: appointment.date,
        patientName: appointment.patientName,
        professionalName: professionals.find(professional => professional.id === professionalId)!.name,
      };
    } catch (error) {
      return { actionSuccess: false, actionError: error instanceof Error ? error.message : 'Falha no cancelamento.' };
    }
  };
}
