import { parseConnectionTarget } from '../src/connectionUrl';

test('builds a local WebSocket URL from an IPv4 address and port', () => {
  expect(parseConnectionTarget('192.168.1.50', '81')).toEqual({
    url: 'ws://192.168.1.50:81',
  });
});

test('builds a secure WebSocket URL from an HTTPS tunnel URL', () => {
  expect(
    parseConnectionTarget('https://abc123.ngrok.app/homesafe', '81'),
  ).toEqual({
    url: 'wss://abc123.ngrok.app/homesafe',
  });
});

test('preserves an explicit public URL port and query', () => {
  expect(
    parseConnectionTarget('https://example.com:8443/homesafe?token=test', '81'),
  ).toEqual({
    url: 'wss://example.com:8443/homesafe?token=test',
  });
});

test('rejects invalid local targets and unsupported schemes', () => {
  expect(() => parseConnectionTarget('192.168.1.999', '81')).toThrow(
    'valid IPv4 address',
  );
  expect(() => parseConnectionTarget('http://example.com', '81')).toThrow(
    'valid IPv4 address',
  );
  expect(() => parseConnectionTarget('https://example.com', '0')).not.toThrow();
});

test('rejects credentials and fragments in public URLs', () => {
  expect(() =>
    parseConnectionTarget('https://user:pass@example.com', '81'),
  ).toThrow('without credentials');
  expect(() => parseConnectionTarget('https://example.com/#app', '81')).toThrow(
    'without credentials',
  );
});
