import { durationMinutes, type BookingWithRoom, type Room } from "./db";

// The visible booking window for the calendar grid — wide enough to cover a
// normal teaching day without rendering rows nobody will ever click.
export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 20;
export const SLOT_MINUTES = 30;

const pad = (n: number): string => String(n).padStart(2, "0");

function minutesToTime(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Every slot's start time, as "HH:mm", from DAY_START_HOUR up to (not
 *  including) DAY_END_HOUR — one row of the calendar per entry. */
export function slotTimes(): string[] {
  const times: string[] = [];
  for (let mins = DAY_START_HOUR * 60; mins < DAY_END_HOUR * 60; mins += SLOT_MINUTES) {
    times.push(minutesToTime(mins));
  }
  return times;
}

// Calendar dates (not booking timestamps) — plain YYYY-MM-DD day arithmetic,
// done in UTC purely so `Date` has some offset to be consistent about. This
// never touches a booking's own Australia/Canberra timestamp.
export function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

export type CalendarCell =
  | { kind: "empty"; startsAt: string; endsAt: string; bookable: boolean }
  | { kind: "covered" }
  | { kind: "booking"; booking: BookingWithRoom; rowSpan: number; isPast: boolean };

/** One row per slot in `slotTimes()`, one column per room, in the same order
 *  as `rooms`. A booking that starts on a displayed slot occupies a
 *  `rowSpan`-tall cell; the rows under it are `"covered"` so the caller skips
 *  rendering a `<td>` for them (the rowspan already covers that space). A
 *  booking starting outside `date` (a different day, or one that runs past
 *  DAY_END_HOUR) is simply not shown on this day's grid — the same scope
 *  this app already keeps everywhere else (one slice of booking, not a full
 *  calendar system). */
export function buildCalendar(
  date: string,
  rooms: Room[],
  bookings: BookingWithRoom[],
  now: string,
): { times: string[]; grid: CalendarCell[][] } {
  const times = slotTimes();
  const grid: CalendarCell[][] = times.map((time) =>
    rooms.map(() => {
      const startsAt = `${date}T${time}`;
      const endsAt = `${date}T${minutesToTime(timeToMinutes(time) + SLOT_MINUTES)}`;
      return { kind: "empty", startsAt, endsAt, bookable: startsAt >= now } as CalendarCell;
    }),
  );

  for (const booking of bookings) {
    if (!booking.startsAt.startsWith(`${date}T`)) continue;
    const roomIndex = rooms.findIndex((room) => room.id === booking.roomId);
    if (roomIndex === -1) continue;

    // Floor/ceil to the containing slot rather than requiring exact
    // alignment — the click-to-book links always land on a slot boundary,
    // but the form itself doesn't force one, so a booking can start or end
    // mid-slot. The cell's own text still shows its real start/end time;
    // only its position on the grid snaps to the nearest slot.
    const dayStart = DAY_START_HOUR * 60;
    const startMinute = timeToMinutes(booking.startsAt.slice(11, 16));
    const endMinute = startMinute + durationMinutes(booking.startsAt, booking.endsAt);
    if (endMinute <= dayStart || startMinute >= DAY_END_HOUR * 60) continue; // outside this day's grid

    const rowIndex = Math.max(0, Math.floor((startMinute - dayStart) / SLOT_MINUTES));
    const endRow = Math.min(times.length, Math.ceil((endMinute - dayStart) / SLOT_MINUTES));
    const span = Math.max(1, endRow - rowIndex);
    grid[rowIndex][roomIndex] = {
      kind: "booking",
      booking,
      rowSpan: span,
      isPast: booking.endsAt < now,
    };
    for (let i = 1; i < span; i++) {
      grid[rowIndex + i][roomIndex] = { kind: "covered" };
    }
  }

  return { times, grid };
}
