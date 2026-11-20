const zone = 'Asia/Ho_Chi_Minh';
const localHour = (value: string) => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(value)));
const localDate = (value: string) => new Date(value).toLocaleDateString('vi-VN', { timeZone: zone });

export function pickupSessionText(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return `${localDate(value)} · ${localHour(value) < 12 ? 'Buổi sáng (07:00–12:00)' : 'Buổi chiều (13:00–17:00)'}`;
}

export function dueDeadlineText(value?: string | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  const time = new Date(value).toLocaleTimeString('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${localDate(value)} · hạn ${time}`;
}
