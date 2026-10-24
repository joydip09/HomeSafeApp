export type Sensor = {
  value: number | null;
  valid: boolean;
  last_updated_ms: number | null;
  receivedAt: number;
};
export type DeviceState = {
  device: any;
  environment: any;
  hazards: any;
  audio: any;
  security: any;
  alarms: any;
};
export type Envelope = {
  version: 1;
  type: string;
  timestamp_ms?: number;
  sequence?: number;
  event_id?: number;
  data?: any;
  request_id?: string;
  command?: string;
  success?: boolean;
  error?: { code: string; message: string };
};
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function parseMessage(raw: string): Envelope | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (!object(v) || v.version !== 1 || typeof v.type !== 'string')
      return null;
    if (
      v.sequence != null &&
      (!Number.isInteger(v.sequence) ||
        v.sequence < 0 ||
        v.sequence > 0xffffffff)
    )
      return null;
    return v as Envelope;
  } catch {
    return null;
  }
}
export function validSnapshot(m: Envelope) {
  return (
    m.type === 'state_snapshot' &&
    object(m.data) &&
    ['device', 'environment', 'hazards', 'audio', 'security', 'alarms'].every(
      k => object(m.data![k]),
    )
  );
}
const sensor = (s: any) => ({
  value:
    typeof s?.value === 'number' && Number.isFinite(s.value) ? s.value : null,
  valid:
    s?.valid === true &&
    typeof s?.value === 'number' &&
    Number.isFinite(s.value),
  last_updated_ms: Number.isFinite(s?.last_updated_ms)
    ? s.last_updated_ms
    : null,
  receivedAt: Date.now(),
});
export function normalizeSection(key: string, v: any): any {
  if (!object(v)) return {};
  if (key === 'environment')
    return {
      ...v,
      temperature_c: sensor(v.temperature_c),
      humidity_rh: sensor(v.humidity_rh),
      mq2_adc: sensor(v.mq2_adc),
      mq135_adc: sensor(v.mq135_adc),
      flame: { ...v.flame, adc: sensor(v.flame?.adc) },
      pir: { ...v.pir, last_received_at: Date.now() },
    };
  if (key === 'audio') return { ...v, receivedAt: Date.now() };
  return v;
}
export const emptyState: DeviceState = {
  device: {},
  environment: {},
  hazards: {},
  audio: {},
  security: {},
  alarms: {},
};
export function applyState(previous: DeviceState, m: Envelope): DeviceState {
  if (!object(m.data)) return previous;
  if (m.type === 'state_snapshot') {
    const next: any = { ...emptyState };
    Object.keys(emptyState).forEach(k => {
      if (object(m.data![k])) next[k] = normalizeSection(k, m.data![k]);
    });
    return next;
  }
  if (m.type !== 'state_update') return previous;
  const next = { ...previous } as any;
  Object.keys(emptyState).forEach(k => {
    if (Object.prototype.hasOwnProperty.call(m.data, k) && object(m.data[k]))
      next[k] = normalizeSection(k, m.data[k]);
  });
  return next;
}
export type AppEvent = {
  id: string;
  event_id: number;
  sequence: number;
  type: string;
  title: string;
  details: string;
  uptime: number;
  receivedAt: number;
  data: any;
};
export function toEvent(m: Envelope): AppEvent | null {
  if (
    ![
      'acoustic_event',
      'hazard_event',
      'security_event',
      'alarm_event',
    ].includes(m.type) ||
    !Number.isInteger(m.event_id) ||
    !object(m.data) ||
    !Number.isInteger(m.sequence)
  )
    return null;
  const d = m.data;
  let title = m.type.replace('_event', '');
  let details = '';
  if (m.type === 'acoustic_event') {
    const labels: any = {
      alarm: 'Possible alarm sound',
      distress: 'Possible distress sound',
      glass_break: 'Possible glass breaking',
      impact: 'Possible impact sound',
    };
    title =
      labels[d.detected_class] ||
      `Acoustic event: ${String(d.detected_class || 'unknown')}`;
    details = `Model confidence ${
      typeof d.confidence === 'number'
        ? `${Math.round(d.confidence * 100)}%`
        : 'unavailable'
    }`;
  }
  if (m.type === 'hazard_event') {
    title = `${d.source || 'Environmental'} hazard ${
      d.active ? 'detected' : 'cleared'
    }`;
    details = `Environmental hazard state: ${
      d.environmental_active ? 'active' : 'clear'
    }`;
  }
  if (m.type === 'security_event') {
    title = String(d.name || 'Security changed').replaceAll('_', ' ');
    details = `${d.armed ? 'Armed' : 'Disarmed'} · schedule ${
      d.schedule_enabled ? 'on' : 'off'
    }`;
  }
  if (m.type === 'alarm_event') {
    title = `Alarm ${d.action || 'updated'}`;
    details = `Environmental ${
      d.environmental_active ? 'active' : 'clear'
    } · security ${d.security_active ? 'active' : 'clear'}`;
  }
  return {
    id: `${m.type}:${m.event_id}:${m.sequence}:${m.timestamp_ms || 0}`,
    event_id: m.event_id!,
    sequence: m.sequence!,
    type: m.type,
    title,
    details,
    uptime: m.timestamp_ms || 0,
    receivedAt: Date.now(),
    data: d,
  };
}
