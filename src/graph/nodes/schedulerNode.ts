import { AppointmentService, professionals } from '../../services/appointmentService.ts';
import type { GraphState } from '../graph.ts';
import { z } from 'zod/v3';

const ScheduleRequiredFieldsSchema = z.object({
  professionalId: z.number().int().positive(),
  datetime: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().optional(),
  reason: z.string().trim().min(1).max(500).optional(),
});

export function createSchedulerNode(appointmentService: AppointmentService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      const validation = ScheduleRequiredFieldsSchema.safeParse(state);
      if (!validation.success) {
        return { actionSuccess: false, actionError: 'Informe profissional, data ISO válida e duração de 30 minutos.' };
      }
      const { professionalId, datetime, durationMinutes, reason } = validation.data;
      const appointment = appointmentService.bookAppointment(
        professionalId, new Date(datetime), state, reason ?? 'Consulta fictícia', durationMinutes,
      );
      return {
        actionSuccess: true,
        actionError: undefined,
        appointmentData: appointment,
        datetime: appointment.date,
        patientName: appointment.patientName,
        professionalName: professionals.find(professional => professional.id === professionalId)!.name,
      };
    } catch (error) {
      return { actionSuccess: false, actionError: error instanceof Error ? error.message : 'Falha no agendamento.' };
    }
  };
}
