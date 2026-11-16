import { it } from 'node:test';
import assert from 'node:assert/strict';
import { AppointmentService } from '../src/services/appointmentService.ts';
import { createSchedulerNode } from '../src/graph/nodes/schedulerNode.ts';
import { createCancellerNode } from '../src/graph/nodes/cancellerNode.ts';

const now = Date.parse('2030-01-01T00:00:00Z');
const slot = new Date('2030-01-02T10:00:00Z');
const operator = { operatorAuthorized: true, operatorPatientId: 'paciente-demo-001' };

it('agenda, bloqueia duplicidade e sobreposição, permite horários adjacentes e outro médico', () => {
  const service = new AppointmentService(() => now);
  const appointment = service.bookAppointment(1, slot, operator, 'Consulta fictícia');
  assert.equal(appointment.durationMinutes, 30);
  assert.equal(appointment.patientName, 'Paciente Fictício Um');
  for (const time of ['10:00', '10:15', '09:45']) {
    assert.throws(() => service.bookAppointment(1, new Date(`2030-01-02T${time}:00Z`), operator, 'Demo'), /indisponível/);
  }
  assert.doesNotThrow(() => service.bookAppointment(1, new Date('2030-01-02T10:30:00Z'), operator, 'Demo'));
  assert.doesNotThrow(() => service.bookAppointment(2, slot, operator, 'Demo'));
});

it('valida médico, data futura, expediente UTC e duração fixa', () => {
  const service = new AppointmentService(() => now);
  assert.throws(() => service.bookAppointment(999, slot, operator, 'Demo'), /Profissional não encontrado/);
  for (const date of [new Date('inválida'), new Date(now), new Date('2029-01-01T10:00:00Z')]) {
    assert.throws(() => service.bookAppointment(1, date, operator, 'Demo'), /válida e futura/);
  }
  for (const time of ['07:59:00', '17:31:00', '10:00:01']) {
    assert.throws(() => service.bookAppointment(1, new Date(`2030-01-02T${time}Z`), operator, 'Demo'), /expediente/);
  }
  for (const duration of [0, -30, 15, 60, NaN]) {
    assert.throws(() => service.bookAppointment(1, slot, operator, 'Demo', duration), /30 minutos/);
  }
  assert.doesNotThrow(() => service.bookAppointment(1, new Date('2030-01-02T17:30:00Z'), operator, 'Demo'));
});

it('cancela somente com contexto do operador e paciente correto, sem usar nome do prompt', () => {
  const service = new AppointmentService(() => now);
  service.bookAppointment(1, slot, operator, 'Demo');
  assert.throws(() => service.cancelAppointment(1, slot, {}), /Operador não autorizado/);
  assert.throws(() => service.cancelAppointment(1, slot, { ...operator, operatorPatientId: 'desconhecido' }), /Paciente fictício/);
  assert.throws(() => service.cancelAppointment(1, slot, { ...operator, operatorPatientId: 'paciente-demo-002' }), /não encontrado/);
  assert.equal(service.checkAvailability(1, slot), false);
  service.cancelAppointment(1, slot, operator);
  assert.equal(service.checkAvailability(1, slot), true);
  assert.throws(() => service.cancelAppointment(1, slot, operator), /não encontrado/);
});

it('serviços isolam memória por instância e não expõem referência interna', () => {
  const service = new AppointmentService(() => now);
  const appointment = service.bookAppointment(1, slot, operator, 'Demo');
  appointment.date = '2030-01-02T12:00:00Z';
  assert.equal(service.checkAvailability(1, slot), false);
  assert.equal(new AppointmentService(() => now).checkAvailability(1, slot), true);
});

it('nós rejeitam datas impossíveis, ausência de timezone e contexto de cancelamento ausente', async () => {
  const service = new AppointmentService(() => now);
  const schedule = createSchedulerNode(service);
  for (const datetime of ['2030-02-31T10:00:00Z', '2030-01-02T10:00:00', 'inválida']) {
    const result = await schedule({ messages: [], ...operator, professionalId: 1, datetime });
    assert.equal(result.actionSuccess, false);
    assert.match(result.actionError!, /data ISO válida/);
  }
  service.bookAppointment(1, slot, operator, 'Demo');
  const result = await createCancellerNode(service)({
    messages: [], professionalId: 1, datetime: slot.toISOString(), patientName: 'Paciente Fictício Um',
  });
  assert.equal(result.actionSuccess, false);
  assert.match(result.actionError!, /Operador não autorizado/);
  assert.equal(service.checkAvailability(1, slot), false);
});
