const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type KstDateParts = {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function kstParts(date: Date): KstDateParts {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function kstMinutesOfDay(date: Date): number {
  const parts = kstParts(date);
  return parts.hour * 60 + parts.minute;
}

export function atKstMinutesOfDay(base: Date, minutesOfDay: number, dayOffset = 0): Date {
  const parts = kstParts(base);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return new Date(
    Date.UTC(parts.year, parts.monthIndex, parts.day + dayOffset, hour - 9, minute, 0, 0),
  );
}

export function atKstTime(base: Date, hhmm: string, dayOffset = 0): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return atKstMinutesOfDay(base, hour * 60 + minute, dayOffset);
}

export function formatKstHHmm(date: Date): string {
  const parts = kstParts(date);
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}
