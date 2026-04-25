export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function monthTitle(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function getCalendarCells(date: Date): Array<number | null> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function isTodayInActiveMonth(activeMonth: Date, day: number | null, referenceDate: Date = new Date()): boolean {
  if (day === null) {
    return false;
  }

  return (
    activeMonth.getFullYear() === referenceDate.getFullYear() &&
    activeMonth.getMonth() === referenceDate.getMonth() &&
    day === referenceDate.getDate()
  );
}
