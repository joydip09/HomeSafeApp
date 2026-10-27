import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { DeviceConnection, Link } from './src/connection';
import { parseConnectionTarget } from './src/connectionUrl';
import {
  applyState,
  AppEvent,
  DeviceState,
  emptyState,
  toEvent,
} from './src/protocol';
import {
  clearEvents,
  defaults,
  loadEvents,
  loadPrefs,
  Preferences,
  savePrefs,
  storeEvent,
} from './src/storage';

const C = {
  teal: '#087E82',
  navy: '#123B4A',
  blue: '#3478B8',
  mint: '#E6F5F1',
  green: '#147D64',
  red: '#B42332',
  paleRed: '#FDEBEC',
  amber: '#A15C00',
  paleAmber: '#FFF3D8',
  ink: '#17323B',
  muted: '#627781',
  line: '#DCE7E9',
  bg: '#F4F8F8',
  white: '#FFFFFF',
  grey: '#8A9AA0',
};
type Tab = 'Home' | 'Environment' | 'Security' | 'History';
const tabs: Tab[] = ['Home', 'Environment', 'Security', 'History'];
const labelLink: Record<Link, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  awaiting_snapshot: 'Syncing device…',
  synchronized: 'Connected · synchronized',
  error: 'Connection error',
};
const freshness = (s: any, connected: boolean) =>
  !s || !s.valid || s.value == null
    ? 'Unavailable'
    : !connected || Date.now() - (s.receivedAt || 0) > 15000
    ? 'Stale · last value retained'
    : 'Live';
const sectionFreshness = (
  valid: boolean,
  receivedAt: number,
  connected: boolean,
) =>
  !valid
    ? 'Unavailable'
    : !connected || Date.now() - receivedAt > 15000
    ? 'Stale · last value retained'
    : 'Live';
const isNewerSequence = (next: number, previous: number) => {
  const delta =
    next >= previous ? next - previous : 0x100000000 - previous + next;
  return delta !== 0 && delta < 0x80000000;
};
function Header({
  title,
  subtitle,
  gear = false,
  onGear,
}: {
  title: string;
  subtitle: string;
  gear?: boolean;
  onGear?: () => void;
}) {
  return (
    <View style={S.header}>
      <View>
        <Text style={S.brand}>
          HOMESAFE <Text style={{ color: C.teal }}>●</Text>
        </Text>
        <Text style={S.heading}>{title}</Text>
        <Text style={S.sub}>{subtitle}</Text>
      </View>
      {gear && (
        <TouchableOpacity style={S.gear} onPress={onGear}>
          <Text style={S.gearIcon}>⚙</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
function Card({ children, style }: any) {
  return <View style={[S.card, style]}>{children}</View>;
}
function Section({ children }: any) {
  return <Text style={S.section}>{children}</Text>;
}
function Badge({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'good' | 'bad' | 'warn' | 'neutral';
}) {
  const colors: any = {
    good: [C.green, C.mint],
    bad: [C.red, C.paleRed],
    warn: [C.amber, C.paleAmber],
    neutral: [C.muted, '#EDF1F2'],
  };
  return (
    <View style={[S.badge, { backgroundColor: colors[tone][1] }]}>
      <Text style={{ color: colors[tone][0], fontSize: 11, fontWeight: '700' }}>
        {text}
      </Text>
    </View>
  );
}
function EventRow({ item }: { item: AppEvent }) {
  return (
    <View style={S.eventRow}>
      <View
        style={[
          S.eventDot,
          {
            backgroundColor:
              item.type === 'alarm_event'
                ? C.red
                : item.type === 'hazard_event'
                ? C.amber
                : C.teal,
          },
        ]}
      />
      <View style={S.eventContent}>
        <Text style={S.rowTitle}>{item.title}</Text>
        <Text style={S.micro}>{item.details}</Text>
      </View>
      <Text style={S.micro}>
        Received{' '}
        {new Date(item.receivedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );
}
function AppRoot() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Home');
  const [settings, setSettings] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [draft, setDraft] = useState<Preferences>(defaults);
  const [state, setState] = useState<DeviceState>(emptyState);
  const [link, setLink] = useState<Link>('disconnected');
  const [linkError, setLinkError] = useState('');
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('All');
  const [notice, setNotice] = useState('');
  const [, tick] = useState(0);
  const conn = useRef(new DeviceConnection());
  const seq = useRef<number | null>(null);
  const requests = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    let alive = true;
    const connection = conn.current;
    const commandTimers = requests.current;
    Promise.all([loadPrefs(), loadEvents()]).then(([p, e]) => {
      if (alive) {
        setPrefs(p);
        setDraft(p);
        setEvents(e);
      }
    });
    const timer = setInterval(() => tick(n => n + 1), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
      connection.onStatus = () => {};
      connection.onMessage = () => {};
      connection.disconnect();
      commandTimers.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    conn.current.onStatus = (s, e) => {
      setLink(s);
      setLinkError(e || '');
      if (s === 'awaiting_snapshot') seq.current = null;
      if ((s === 'disconnected' || s === 'error') && requests.current.size)
        setNotice(
          'Connection lost while a command was pending. Its outcome is uncertain.',
        );
      if (s === 'disconnected' || s === 'error') {
        requests.current.forEach(t => clearTimeout(t));
        requests.current.clear();
        setPending({});
      }
    };
    conn.current.onMessage = m => {
      if (Number.isInteger(m.sequence)) {
        if (seq.current !== null && !isNewerSequence(m.sequence!, seq.current))
          return;
        seq.current = m.sequence!;
      }
      if (
        m.type === 'command_result' &&
        m.request_id &&
        !requests.current.has(m.request_id)
      )
        return;
      if (m.type === 'state_snapshot' || m.type === 'state_update')
        setState(prev => applyState(prev, m));
      const ev = toEvent(m);
      if (ev) {
        setEvents(old =>
          old.some(x => x.id === ev.id) ? old : [ev, ...old].slice(0, 500),
        );
        storeEvent(ev).catch(() => {});
        if (prefs.notifications) setNotice(ev.title);
      }
      if (m.type === 'command_result' && m.request_id) {
        const timer = requests.current.get(m.request_id);
        if (timer) clearTimeout(timer);
        requests.current.delete(m.request_id);
        setPending(p => {
          const n = { ...p };
          delete n[m.request_id!];
          return n;
        });
        if (m.success && m.command === 'get_status' && m.data?.state)
          setState(prev =>
            applyState(prev, {
              version: 1,
              type: 'state_snapshot',
              data: m.data.state,
            }),
          );
        else if (m.success && m.data?.security)
          setState(prev => ({ ...prev, security: m.data!.security }));
        else if (m.success && m.command === 'silence_alarm' && m.data)
          setState(prev => ({
            ...prev,
            alarms: {
              ...prev.alarms,
              environmental_active: m.data!.environmental_alarm_active,
              security_active: m.data!.security_alarm_active,
              any_active: m.data!.any_active,
            },
            security: {
              ...prev.security,
              alarm_active: m.data!.security_alarm_active,
            },
          }));
        if (!m.success)
          setNotice(
            `${m.error?.code || 'Command failed'}: ${
              m.error?.message || 'Request rejected'
            }`,
          );
      }
    };
  }, [prefs.notifications]);
  const url = useMemo(() => {
    try {
      return parseConnectionTarget(prefs.ip, prefs.port || '81').url;
    } catch {
      return '';
    }
  }, [prefs]);
  const start = () => {
    let target: string;
    try {
      target = parseConnectionTarget(prefs.ip, prefs.port || '81').url;
    } catch (e) {
      setNotice(String(e instanceof Error ? e.message : e));
      setSettings(true);
      return;
    }
    conn.current.connect(target, prefs.autoReconnect);
    setSettings(false);
  };
  const command = (name: string, data?: object) => {
    const id = `hs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      conn.current.send({
        version: 1,
        type: 'command',
        request_id: id,
        command: name,
        ...(data ? { data } : {}),
      });
      setPending(p => ({ ...p, [id]: name }));
      const t = setTimeout(() => {
        requests.current.delete(id);
        setPending(p => {
          const n = { ...p };
          delete n[id];
          return n;
        });
        setNotice(
          `No acknowledgement for ${name.replaceAll(
            '_',
            ' ',
          )}. Outcome is uncertain.`,
        );
      }, 8000);
      requests.current.set(id, t);
    } catch (e) {
      setNotice(String(e));
    }
  };
  const updatePrefs = (key: keyof Preferences, value: any) =>
    setDraft(p => ({ ...p, [key]: value }));
  const confirmClearHistory = () =>
    Alert.alert(
      'Clear local history',
      'Remove all saved events from this phone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setEvents([]);
            clearEvents().catch(() =>
              setNotice('Could not clear local event history.'),
            );
          },
        },
      ],
    );
  const save = async () => {
    const p = { ...draft, port: draft.port || '81' };
    setPrefs(p);
    await savePrefs(p);
    setSettings(false);
    if (link !== 'disconnected') conn.current.disconnect();
  };
  const d = state.device || {},
    env = state.environment || {},
    sec = state.security || {},
    hz = state.hazards || {},
    alarms = state.alarms || {};
  const live = link === 'synchronized';
  const hazard = hz.environmental_active === true;
  const critical = hazard || alarms.security_active === true;
  const metric = (title: string, s: any, unit: string) => (
    <View style={S.metric}>
      <Text style={S.metricLabel}>{title}</Text>
      <Text style={S.metricValue}>
        {s?.valid && s.value != null ? `${s.value}${unit}` : '—'}
      </Text>
      <Text
        style={[
          S.micro,
          {
            color:
              freshness(s, live) === 'Live'
                ? C.green
                : freshness(s, live) === 'Unavailable'
                ? C.grey
                : C.amber,
          },
        ]}
      >
        {freshness(s, live)}
      </Text>
    </View>
  );
  const home = (
    <>
      <Header
        title="Safety overview"
        subtitle="Your home, at a glance"
        gear
        onGear={() => {
          setDraft(prefs);
          setSettings(true);
        }}
      />
      <TouchableOpacity
        onPress={() => (link === 'synchronized' ? null : start())}
        style={[
          S.linkCard,
          { borderColor: live ? C.green : link === 'error' ? C.red : C.line },
        ]}
      >
        <View
          style={[S.linkIcon, { backgroundColor: live ? C.mint : '#EDF1F2' }]}
        >
          <Text style={{ fontSize: 20 }}>{live ? '⌁' : '⌁'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={S.rowTitle}>{labelLink[link]}</Text>
          <Text style={S.micro}>
            {live
              ? d.ip_address || url
              : linkError || url || 'Set device IP in Settings'}
          </Text>
        </View>
        {!live && (
          <TouchableOpacity
            style={S.smallButton}
            onPress={() => (url ? start() : setSettings(true))}
          >
            <Text style={S.smallButtonText}>{url ? 'Connect' : 'Set up'}</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      <Card
        style={[
          S.safetyCard,
          { backgroundColor: critical ? C.paleRed : C.mint },
        ]}
      >
        <View style={S.rowBetween}>
          <Text style={S.kicker}>SYSTEM STATUS</Text>
          <Badge
            text={critical ? 'ATTENTION' : 'MONITORING'}
            tone={critical ? 'bad' : 'good'}
          />
        </View>
        <Text style={[S.safetyTitle, { color: critical ? C.red : C.navy }]}>
          {!live
            ? 'Device status unavailable'
            : critical
            ? 'Hazard reported'
            : 'No active hazards reported'}
        </Text>
        <Text style={S.body}>
          {!live
            ? 'Last known readings remain visible and are marked stale.'
            : critical
            ? 'The ESP32 reports an active condition. Check the terminal and follow your safety plan.'
            : 'The terminal is connected and reporting current state.'}
        </Text>
      </Card>
      <View style={S.metricGrid}>
        <Card style={S.metricCard}>
          {metric('TEMPERATURE', env.temperature_c, '°C')}
        </Card>
        <Card style={S.metricCard}>
          {metric('HUMIDITY', env.humidity_rh, '%')}
        </Card>
      </View>
      <Section>DEVICE STATUS</Section>
      <Card>
        <View style={S.rowBetween}>
          <Text style={S.rowTitle}>Security</Text>
          <Badge
            text={sec.armed ? 'ARMED' : 'DISARMED'}
            tone={sec.armed ? 'good' : 'neutral'}
          />
        </View>
        <View style={S.divider} />
        <View style={S.rowBetween}>
          <Text style={S.rowTitle}>Environmental alarm</Text>
          <Badge
            text={alarms.environmental_active ? 'ACTIVE' : 'CLEAR'}
            tone={alarms.environmental_active ? 'bad' : 'good'}
          />
        </View>
        <View style={S.divider} />
        <View style={S.rowBetween}>
          <Text style={S.rowTitle}>Security alarm</Text>
          <Badge
            text={alarms.security_active ? 'ACTIVE' : 'CLEAR'}
            tone={alarms.security_active ? 'bad' : 'good'}
          />
        </View>
      </Card>
      <Section>RECENT EVENTS</Section>
      <Card>
        {events.length ? (
          events
            .slice(0, 3)
            .map(e => <EventRow key={`${e.id}-${e.sequence}`} item={e} />)
        ) : (
          <Text style={S.body}>
            No events received yet. Events are stored locally on this phone.
          </Text>
        )}
      </Card>
      <Card style={S.note}>
        <Text style={S.noteText}>
          Events may be missed while disconnected. Reconnecting restores current
          device state, but cannot recover events that were not delivered.
          Android background monitoring is not guaranteed.
        </Text>
      </Card>
    </>
  );
  const environment = (
    <>
      <Header
        title="Environment"
        subtitle="Sensor readings from your terminal"
      />
      <Card>
        <View style={S.rowBetween}>
          <Text style={S.rowTitle}>Device data</Text>
          <Badge
            text={live ? 'LIVE' : 'STALE / OFFLINE'}
            tone={live ? 'good' : 'warn'}
          />
        </View>
        <Text style={S.micro}>
          Raw sensor data and firmware-reported status
        </Text>
      </Card>
      <View style={S.metricGrid}>
        {metricCard('temperature', metric('TEMPERATURE', env.temperature_c, '°C'))}
        {metricCard('humidity', metric('HUMIDITY', env.humidity_rh, '%'))}
        {metricCard('mq2', metric('MQ-2 · RAW ADC', env.mq2_adc, ''))}
        {metricCard('mq135', metric('MQ-135 · RAW ADC', env.mq135_adc, ''))}
      </View>
      <Section>FIRMWARE HAZARD FLAGS</Section>
      <Card>
        {[
          ['Flame', hz.flame_active],
          ['MQ-2', hz.mq2_active],
          ['MQ-135', hz.mq135_active],
          ['Environmental aggregate', hz.environmental_active],
        ].map(([name, val]: any) => (
          <View key={name} style={S.listRow}>
            <Text style={S.rowTitle}>{name}</Text>
            <Badge
              text={
                val === true ? 'ACTIVE' : val === false ? 'CLEAR' : 'UNKNOWN'
              }
              tone={val === true ? 'bad' : val === false ? 'good' : 'neutral'}
            />
          </View>
        ))}
      </Card>
      <Section>DISCRETE SENSORS</Section>
      <Card>
        <View style={S.listRow}>
          <View>
            <Text style={S.rowTitle}>Flame detection</Text>
            <Text style={S.micro}>
              Raw ADC {env.flame?.adc?.valid ? env.flame.adc.value : '—'} ·{' '}
              {freshness(env.flame?.adc, live)}
            </Text>
          </View>
          <Text style={S.body}>
            {env.flame?.valid === true
              ? env.flame.detected
                ? 'Detected'
                : 'Not detected'
              : 'Unavailable'}
          </Text>
        </View>
        <View style={S.listRow}>
          <View>
            <Text style={S.rowTitle}>PIR motion</Text>
            <Text style={S.micro}>
              {sectionFreshness(
                env.pir?.valid === true,
                env.pir?.last_received_at || 0,
                live,
              )}
            </Text>
          </View>
          <Text style={S.body}>
            {env.pir?.valid === true
              ? env.pir.motion
                ? 'Motion detected'
                : 'No motion'
              : 'Unavailable'}
          </Text>
        </View>
        <View style={S.listRow}>
          <Text style={S.rowTitle}>Sensor system</Text>
          <Text style={S.body}>
            {d.sensors_initialized === true
              ? 'Initialized'
              : d.sensors_initialized === false
              ? 'Not initialized'
              : 'Unknown'}
          </Text>
        </View>
      </Card>
      <Section>LATEST AUDIO INFERENCE</Section>
      <Card>
        <Text style={S.rowTitle}>
          {state.audio?.inference_valid
            ? audioLabel(state.audio.detected_class)
            : 'No inference available'}
        </Text>
        <Text style={S.micro}>
          {state.audio?.inference_valid
            ? `ESP32 model output · ${
                typeof state.audio.confidence === 'number'
                  ? Math.round(state.audio.confidence * 100) + '% confidence'
                  : ''
              } · ${sectionFreshness(true, state.audio.receivedAt || 0, live)}`
            : 'Missing inference data is not interpreted as normal.'}
        </Text>
      </Card>
      <Card style={S.note}>
        <Text style={S.noteText}>
          MQ-2 and MQ-135 values are raw ADC counts, not ppm or AQI. Hazard
          flags are determined by the firmware.
        </Text>
      </Card>
    </>
  );
  const security = (
    <>
      <Header title="Security" subtitle="Control the terminal security mode" />
      <Card style={S.securityHero}>
        <Text style={S.kicker}>SECURITY MODE</Text>
        <View style={S.rowBetween}>
          <Text style={S.safetyTitle}>
            {sec.armed === true
              ? 'Armed'
              : sec.armed === false
              ? 'Disarmed'
              : 'Unavailable'}
          </Text>
          <Badge
            text={sec.armed === true ? 'ARMED' : 'DISARMED'}
            tone={sec.armed ? 'good' : 'neutral'}
          />
        </View>
        <Text style={S.body}>
          Commands are confirmed by firmware acknowledgement and state updates.
        </Text>
        <TouchableOpacity
          disabled={!live || !!Object.keys(pending).length}
          onPress={() => command('set_security_mode', { armed: !sec.armed })}
          style={[S.button, !live && S.disabled]}
        >
          <Text style={S.buttonText}>
            {pendingMode(pending)
              ? 'Updating…'
              : sec.armed
              ? 'Disarm security'
              : 'Arm security'}
          </Text>
        </TouchableOpacity>
      </Card>
      <Section>DAILY SCHEDULE</Section>
      <ScheduleCard
        sec={sec}
        live={live}
        pending={Object.values(pending).includes('set_security_schedule')}
        command={command}
        Card={Card}
      />
      <Section>ALARMS</Section>
      <Card>
        <AlarmLine
          label="Environmental alarm"
          active={alarms.environmental_active === true}
          Badge={Badge}
        />
        <View style={S.divider} />
        <AlarmLine
          label="Security alarm"
          active={alarms.security_active === true}
          Badge={Badge}
        />
        <TouchableOpacity
          disabled={
            !live || !alarms.security_active || !!Object.keys(pending).length
          }
          onPress={() => command('silence_alarm')}
          style={[
            S.button,
            { backgroundColor: C.navy, marginTop: 16 },
            (!live || !alarms.security_active) && S.disabled,
          ]}
        >
          <Text style={S.buttonText}>
            {pendingSilence(pending) ? 'Silencing…' : 'Silence security alarm'}
          </Text>
        </TouchableOpacity>
        <Text style={[S.micro, { marginTop: 9 }]}>
          Silencing does not clear the underlying hazard. Environmental and
          security alarm states remain separate.
        </Text>
      </Card>
      {Object.keys(pending).length > 0 && (
        <Card>
          <Text style={S.rowTitle}>Command in progress</Text>
          <Text style={S.micro}>
            {Object.values(pending)
              .map(x => x.replaceAll('_', ' '))
              .join(', ')}
          </Text>
        </Card>
      )}
    </>
  );
  const history = (
    <>
      <Header
        title="History"
        subtitle="Events received and saved on this phone"
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 48, marginBottom: 8 }}
      >
        {[
          'All',
          'acoustic_event',
          'hazard_event',
          'security_event',
          'alarm_event',
        ].map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[S.filter, filter === f && S.filterActive]}
          >
            <Text style={[S.filterText, filter === f && { color: C.white }]}>
              {f === 'All' ? 'All' : f.replace('_event', '').replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Card>
        {events.filter(e => filter === 'All' || e.type === filter).length ? (
          events
            .filter(e => filter === 'All' || e.type === filter)
            .map(e => <EventRow key={`${e.id}-${e.sequence}`} item={e} />)
        ) : (
          <Text style={S.body}>
            No matching local events. History contains only events delivered
            while the app was connected.
          </Text>
        )}
      </Card>
      <TouchableOpacity onPress={confirmClearHistory}>
        <Text style={S.clear}>Clear local history</Text>
      </TouchableOpacity>
    </>
  );
  const body =
    tab === 'Home'
      ? home
      : tab === 'Environment'
      ? environment
      : tab === 'Security'
      ? security
      : history;
  return (
    <View style={[S.screen, { paddingTop: Math.max(insets.top, 12) }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {notice ? (
          <TouchableOpacity onPress={() => setNotice('')} style={S.notice}>
            <Text style={S.noticeText}>{notice}　×</Text>
          </TouchableOpacity>
        ) : null}
        {body}
      </ScrollView>
      <View style={[S.tabbar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={S.tab}>
            <Text style={[S.tabIcon, { color: tab === t ? C.teal : C.grey }]}>
              {['⌂', '◉', '▣', '◷'][i]}
            </Text>
            <Text
              style={[
                S.tabText,
                {
                  color: tab === t ? C.teal : C.muted,
                  fontWeight: tab === t ? '700' : '500',
                },
              ]}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {settings && (
        <View style={S.overlay}>
          <View style={S.settings}>
            <View style={S.rowBetween}>
              <Text style={S.heading}>Settings</Text>
              <TouchableOpacity onPress={() => setSettings(false)}>
                <Text style={S.close}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={S.section}>DEVICE CONNECTION</Text>
              <Text style={S.label}>ESP32 IPv4 address or public HTTPS URL</Text>
              <TextInput
                value={draft.ip}
                onChangeText={v => updatePrefs('ip', v)}
                placeholder="192.168.1.50 or https://tunnel.example"
                keyboardType="url"
                autoCapitalize="none"
                style={S.input}
              />
              <Text style={S.label}>WebSocket port</Text>
              <TextInput
                value={draft.port}
                onChangeText={v => updatePrefs('port', v)}
                keyboardType="number-pad"
                style={S.input}
              />
              <View style={S.listRow}>
                <View>
                  <Text style={S.rowTitle}>Automatic reconnection</Text>
                  <Text style={S.micro}>Bounded backoff with jitter</Text>
                </View>
                <Switch
                  value={draft.autoReconnect}
                  onValueChange={v => updatePrefs('autoReconnect', v)}
                  trackColor={{ true: C.teal }}
                />
              </View>
              <Section>DIAGNOSTICS</Section>
              <Text style={S.body}>Status: {labelLink[link]}</Text>
              <Text style={S.micro}>
                Endpoint: {url || 'Not configured'}
                {linkError ? `\n${linkError}` : ''}
              </Text>
              <TouchableOpacity
                style={S.outlineButton}
                onPress={() => command('get_status')}
              >
                <Text style={S.outlineText}>Request device status</Text>
              </TouchableOpacity>
              <View style={S.listRow}>
                <View>
                  <Text style={S.rowTitle}>Event notifications</Text>
                  <Text style={S.micro}>
                    In-app alerts while this screen is open
                  </Text>
                </View>
                <Switch
                  value={draft.notifications}
                  onValueChange={v => updatePrefs('notifications', v)}
                  trackColor={{ true: C.teal }}
                />
              </View>
              <Section>LOCAL HISTORY</Section>
              <Text style={S.micro}>
                {events.length} saved events on this phone
              </Text>
              <TouchableOpacity
                style={S.outlineButton}
                onPress={confirmClearHistory}
              >
                <Text style={S.outlineText}>Clear local history</Text>
              </TouchableOpacity>
              <Section>ABOUT</Section>
              <Text style={S.body}>App 1.0.0 · Protocol v1</Text>
              <Text style={S.micro}>
                Firmware {d.firmware_version || 'Unknown'} · No background
                delivery guarantee
              </Text>
              <TouchableOpacity style={S.button} onPress={save}>
                <Text style={S.buttonText}>Save settings</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
  function metricCard(key: string, child: any) {
    return (
      <Card style={S.metricCard} key={key}>
        {child}
      </Card>
    );
  }
}
function audioLabel(c: any) {
  const labels: any = {
    alarm: 'Possible alarm sound',
    distress: 'Possible distress sound',
    glass_break: 'Possible glass breaking',
    impact: 'Possible impact sound',
    normal: 'Normal sound classification',
  };
  return labels[c] || `Unknown classification: ${String(c)}`;
}
function pendingMode(p: any) {
  return Object.values(p).includes('set_security_mode');
}
function pendingSilence(p: any) {
  return Object.values(p).includes('silence_alarm');
}
function AlarmLine({ label, active, Badge }: any) {
  return (
    <View style={S.listRow}>
      <Text style={S.rowTitle}>{label}</Text>
      <Badge
        text={active ? 'ACTIVE' : 'CLEAR'}
        tone={active ? 'bad' : 'good'}
      />
    </View>
  );
}
function ScheduleCard({ sec, live, pending, command, Card }: any) {
  const [enabled, setEnabled] = useState(false),
    [arm, setArm] = useState('22:00'),
    [disarm, setDisarm] = useState('06:00');
  useEffect(() => {
    setEnabled(sec.schedule_enabled === true);
    if (Number.isInteger(sec.arm_hour))
      setArm(
        `${String(sec.arm_hour).padStart(2, '0')}:${String(
          sec.arm_minute || 0,
        ).padStart(2, '0')}`,
      );
    if (Number.isInteger(sec.disarm_hour))
      setDisarm(
        `${String(sec.disarm_hour).padStart(2, '0')}:${String(
          sec.disarm_minute || 0,
        ).padStart(2, '0')}`,
      );
  }, [
    sec.schedule_enabled,
    sec.arm_hour,
    sec.arm_minute,
    sec.disarm_hour,
    sec.disarm_minute,
  ]);
  const parse = (v: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    return m ? { h: +m[1], m: +m[2] } : null;
  };
  const submit = () => {
    const a = parse(arm),
      d = parse(disarm);
    if (
      enabled &&
      (!a ||
        !d ||
        a.h > 23 ||
        d.h > 23 ||
        a.m > 59 ||
        d.m > 59 ||
        (a.h === d.h && a.m === d.m))
    ) {
      Alert.alert(
        'Invalid schedule',
        'Use 24-hour HH:MM times within range. Arm and disarm times must differ.',
      );
      return;
    }
    command('set_security_schedule', {
      enabled,
      ...(enabled
        ? {
            arm_hour: a!.h,
            arm_minute: a!.m,
            disarm_hour: d!.h,
            disarm_minute: d!.m,
          }
        : {}),
    });
  };
  return (
    <Card>
      <View style={S.rowBetween}>
        <View>
          <Text style={S.rowTitle}>Automatic schedule</Text>
          <Text style={S.micro}>Device local time</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ true: C.teal }}
        />
      </View>
      <Text style={S.label}>Arm time · 24-hour HH:MM</Text>
      <TextInput
        style={S.input}
        value={arm}
        onChangeText={setArm}
        placeholder="22:00"
      />
      <Text style={S.label}>Disarm time · 24-hour HH:MM</Text>
      <TextInput
        style={S.input}
        value={disarm}
        onChangeText={setDisarm}
        placeholder="06:00"
      />
      <TouchableOpacity
        disabled={!live || pending}
        onPress={submit}
        style={[S.outlineButton, (!live || pending) && S.disabled]}
      >
        <Text style={S.outlineText}>
          {pending ? 'Saving…' : 'Save schedule'}
        </Text>
      </TouchableOpacity>
      <Text style={S.micro}>
        Firmware requires both times when enabling, validates their ranges and
        rejects identical times.
      </Text>
    </Card>
  );
}
function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}
const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    paddingTop: 8,
    paddingBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 11,
    letterSpacing: 2.1,
    color: C.muted,
    fontWeight: '800',
    marginBottom: 8,
  },
  heading: { fontSize: 25, color: C.ink, fontWeight: '800' },
  sub: { fontSize: 13, color: C.muted, marginTop: 5 },
  gear: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  gearIcon: { fontSize: 21 },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9EFF0',
  },
  linkCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  micro: { fontSize: 11, color: C.muted, marginTop: 4 },
  eventContent: { flex: 1 },
  smallButton: {
    backgroundColor: C.teal,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  smallButtonText: { color: C.white, fontWeight: '700', fontSize: 12 },
  safetyCard: { padding: 18 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.muted,
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  safetyTitle: { fontSize: 21, fontWeight: '800', marginTop: 13, color: C.ink },
  body: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 7 },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  metricCard: { width: '48.2%', padding: 14 },
  metric: { minHeight: 83, justifyContent: 'center' },
  metricLabel: {
    fontSize: 9,
    color: C.muted,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  metricValue: { fontSize: 24, fontWeight: '800', color: C.ink, marginTop: 6 },
  section: {
    fontSize: 11,
    letterSpacing: 1.1,
    color: C.muted,
    fontWeight: '800',
    marginTop: 15,
    marginBottom: 9,
  },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 12 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#EFF3F4',
    gap: 10,
  },
  eventDot: { width: 8, height: 8, borderRadius: 8 },
  note: { backgroundColor: '#EDF5F7' },
  noteText: { fontSize: 11, color: C.muted, lineHeight: 17 },
  securityHero: { backgroundColor: C.mint },
  button: {
    backgroundColor: C.teal,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 16,
  },
  buttonText: { color: C.white, fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
  listRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomColor: '#EFF3F4',
    borderBottomWidth: 1,
  },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.line,
    paddingTop: 9,
    justifyContent: 'space-around',
  },
  tab: { alignItems: 'center', width: '25%' },
  tabIcon: { fontSize: 20, height: 24 },
  tabText: { fontSize: 10, marginTop: 1 },
  filter: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    marginRight: 7,
  },
  filterActive: { backgroundColor: C.teal, borderColor: C.teal },
  filterText: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  clear: { textAlign: 'center', color: C.red, fontWeight: '700', padding: 16 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,40,48,.38)',
    justifyContent: 'flex-end',
  },
  settings: {
    maxHeight: '92%',
    backgroundColor: C.white,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    paddingBottom: 30,
  },
  close: { fontSize: 30, color: C.muted, paddingHorizontal: 8 },
  label: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: C.ink,
    fontSize: 14,
    marginBottom: 5,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: C.teal,
    borderRadius: 13,
    padding: 12,
    alignItems: 'center',
    marginVertical: 12,
  },
  outlineText: { color: C.teal, fontWeight: '800' },
  notice: {
    backgroundColor: C.navy,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noticeText: { color: C.white, fontWeight: '600', fontSize: 12 },
});
export default App;
