import { applyState, emptyState, parseMessage, toEvent } from '../src/protocol';
import { clearEvents, loadEvents, storeEvent } from '../src/storage';

test('a partial state update replaces included sections and preserves omitted ones', () => {
  const initial = {
    ...emptyState,
    device: { firmware_version: '0.1.0' },
    security: { armed: true },
  };
  const next = applyState(initial, {
    version: 1,
    type: 'state_update',
    data: { security: { armed: false } },
  });
  expect(next.security).toEqual({ armed: false });
  expect(next.device).toEqual({ firmware_version: '0.1.0' });
});

test('a snapshot resets the baseline and retains unavailable sensor values as null', () => {
  const data = {
    device: {},
    environment: { temperature_c: { value: null, valid: false } },
    hazards: {},
    audio: {},
    security: {},
    alarms: {},
  };
  const next = applyState(
    { ...emptyState, security: { armed: true } },
    { version: 1, type: 'state_snapshot', data },
  );
  expect(next.security).toEqual({});
  expect(next.environment.temperature_c.value).toBeNull();
  expect(next.environment.temperature_c.valid).toBe(false);
});

test('invalid JSON and event envelopes are rejected', () => {
  expect(parseMessage('{')).toBeNull();
  expect(
    toEvent({ version: 1, type: 'alarm_event', event_id: 2, sequence: 3 }),
  ).toBeNull();
});

test('SQLite history store de-duplicates by event identity and clears locally', async () => {
  const event = {
    id: 'alarm_event:2:3:4',
    event_id: 2,
    sequence: 3,
    type: 'alarm_event',
    title: 'Alarm',
    details: '',
    uptime: 4,
    receivedAt: 100,
    data: {},
  };
  await storeEvent(event);
  await storeEvent(event);
  expect(await loadEvents()).toEqual([event]);
  await clearEvents();
  expect(await loadEvents()).toEqual([]);
});
