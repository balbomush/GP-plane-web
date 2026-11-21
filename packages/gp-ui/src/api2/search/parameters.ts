import type { Dto } from '../client';

type Parameters = NonNullable<Dto['RunDetail']['parameters']>;

const protocolFields = [
  ['enable_http', 'HTTP'],
  ['enable_tls12', 'TLS 1.2'],
  ['enable_tls13', 'TLS 1.3'],
  ['include_quic', 'QUIC'],
] as const;

const labels: Record<string, string> = {
  ...Object.fromEntries(protocolFields),
  enable_ipv6: 'IPv6',
  scan_level: 'Уровень сканирования',
  repeats: 'Повторы',
  repeat_parallel: 'Параллельные повторы',
  skip_dnscheck: 'Проверять DNS',
  skip_ipblock: 'Проверять IP-блокировку',
  curl_parallelism: 'Параллелизм curl',
  curl_max_time: 'Таймаут HTTP/TLS',
  curl_max_time_quic: 'Таймаут QUIC',
  curl_max_time_doh: 'Таймаут DoH',
  debug_stdout: 'Подробный журнал',
};
const scanLevels: Record<string, string> = {
  quick: 'Быстрый',
  standard: 'Стандартный',
  force: 'Принудительный',
};

export function enabledProtocols(parameters: Parameters | null | undefined) {
  return protocolFields.filter(([key]) => parameters?.[key] === true).map(([, label]) => label);
}

export function historyParameters(parameters: Parameters | null | undefined) {
  return Object.entries(parameters ?? {}).map(([key, raw]) => {
    let value = raw == null ? 'Не сохранено' : String(raw);
    if (typeof raw === 'boolean') {
      const positive = key === 'skip_dnscheck' || key === 'skip_ipblock' ? !raw : raw;
      value = positive ? 'Да' : 'Нет';
    } else if (key === 'scan_level' && typeof raw === 'string') {
      value = scanLevels[raw] ?? raw;
    }
    return { key, label: labels[key] ?? key, value };
  });
}
