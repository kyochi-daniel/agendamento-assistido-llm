export const professionals = Object.freeze([
  { id: 1, name: 'Dr. Alicio da Silva (fictício)', specialty: 'Cardiologia' },
  { id: 2, name: 'Dra. Ana Pereira (fictícia)', specialty: 'Dermatologia' },
  { id: 3, name: 'Dra. Carol Gomes (fictícia)', specialty: 'Neurologia' },
]);

export const patients = Object.freeze([
  { id: 'paciente-demo-001', name: 'Paciente Fictício Um' },
  { id: 'paciente-demo-002', name: 'Paciente Fictício Dois' },
]);

type OperatorContext = { operatorAuthorized?: boolean; operatorPatientId?: string };
type Appointment = {
  date: string;
  durationMinutes: number;
  patientId: string;
  patientName: string;
  professionalId: number;
  reason: string;
};

export class AppointmentService {
  // shortcut: memória de um processo, substituir por armazenamento transacional antes de uso compartilhado.
  private appointments: Appointment[] = [];
  private now: () => number;

  constructor(now = Date.now) {
    this.now = now;
  }

  private validateSlot(professionalId: number, date: Date, durationMinutes: number) {
    if (!professionals.some(professional => professional.id === professionalId)) {
      throw new Error('Profissional não encontrado.');
    }
    if (!Number.isFinite(date.getTime()) || date.getTime() <= this.now()) {
      throw new Error('A data deve ser válida e futura.');
    }
    if (durationMinutes !== 30) throw new Error('A duração da consulta deve ser de 30 minutos.');
    const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
    if (date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0 || minute < 8 * 60 || minute + durationMinutes > 18 * 60) {
      throw new Error('Horário fora do expediente: 08:00 a 18:00 UTC, sem segundos.');
    }
  }

  private getPatient(context: OperatorContext) {
    if (context.operatorAuthorized !== true) throw new Error('Operador não autorizado.');
    const patient = patients.find(patient => patient.id === context.operatorPatientId);
    if (!patient) throw new Error('Paciente fictício não encontrado.');
    return patient;
  }

  checkAvailability(professionalId: number, date: Date, durationMinutes = 30): boolean {
    this.validateSlot(professionalId, date, durationMinutes);
    const start = date.getTime();
    const end = start + durationMinutes * 60_000;
    return !this.appointments.some(appointment => {
      const bookedStart = Date.parse(appointment.date);
      return appointment.professionalId === professionalId &&
        start < bookedStart + appointment.durationMinutes * 60_000 && end > bookedStart;
    });
  }

  bookAppointment(professionalId: number, date: Date, context: OperatorContext, reason: string, durationMinutes = 30) {
    const patient = this.getPatient(context);
    if (!this.checkAvailability(professionalId, date, durationMinutes)) {
      throw new Error('Horário indisponível para este profissional.');
    }
    const appointment = {
      date: date.toISOString(),
      durationMinutes,
      patientId: patient.id,
      patientName: patient.name,
      reason,
      professionalId,
    };
    this.appointments.push(appointment);
    return { ...appointment };
  }

  cancelAppointment(professionalId: number, date: Date, context: OperatorContext) {
    const patient = this.getPatient(context);
    this.validateSlot(professionalId, date, 30);
    const index = this.appointments.findIndex(appointment =>
      appointment.professionalId === professionalId && appointment.patientId === patient.id &&
      Date.parse(appointment.date) === date.getTime());
    if (index === -1) throw new Error('Agendamento não encontrado para cancelamento.');
    return this.appointments.splice(index, 1)[0];
  }
}
