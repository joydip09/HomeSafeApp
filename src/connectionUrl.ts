export type ConnectionTarget = {
  url: string;
};

const isValidPort = (port: string) =>
  /^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;

const isValidIpv4 = (host: string) => {
  const octets = host.split('.');
  return (
    octets.length === 4 &&
    octets.every(
      octet => /^\d{1,3}$/.test(octet) && Number(octet) <= 255,
    )
  );
};

export function parseConnectionTarget(
  input: string,
  port: string,
): ConnectionTarget {
  const target = input.trim();
  if (!target) throw new Error('Enter an ESP32 IPv4 address or HTTPS URL');

  if (isValidIpv4(target)) {
    if (!isValidPort(port)) throw new Error('Enter a valid WebSocket port');
    return { url: `ws://${target}:${port}` };
  }

  if (!target.startsWith('https://'))
    throw new Error('Enter a valid IPv4 address or an https:// URL');

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error('Enter a valid IPv4 address or HTTPS URL');
  }

  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  )
    throw new Error('Enter a valid HTTPS URL without credentials or a fragment');

  return { url: parsed.toString().replace(/^https:/, 'wss:') };
}
