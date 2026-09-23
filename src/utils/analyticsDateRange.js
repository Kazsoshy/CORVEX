const MANILA_TIME_ZONE = 'Asia/Manila';

function toManilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dateStringToDate(value) {
  return new Date(`${value}T12:00:00Z`);
}

function addDays(value, days) {
  const date = dateStringToDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toManilaDateString(date);
}

function addMonths(value, months) {
  const date = dateStringToDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toManilaDateString(date);
}

function addYears(value, years) {
  const date = dateStringToDate(value);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCMonth(month);
  date.setUTCDate(Math.min(day, lastDay));
  return toManilaDateString(date);
}

function startOfWeek(value) {
  const date = dateStringToDate(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(value, offset);
}

function startOfMonth(value) {
  const date = dateStringToDate(value);
  date.setUTCDate(1);
  return toManilaDateString(date);
}

function startOfQuarter(value) {
  const date = dateStringToDate(value);
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  date.setUTCMonth(quarterStartMonth, 1);
  return toManilaDateString(date);
}

function startOfYear(value) {
  const date = dateStringToDate(value);
  date.setUTCMonth(0, 1);
  return toManilaDateString(date);
}

/** Matches backend resolveAnalyticsWindow preset windows (Asia/Manila). */
export function getPresetDateRange(preset = 'this_month') {
  const now = toManilaDateString();
  const key = String(preset || 'this_month').toLowerCase();
  let startDate = startOfMonth(now);
  let endDate = now;
  let label = 'This Month';

  switch (key) {
    case 'today':
      startDate = now;
      endDate = now;
      label = 'Today';
      break;
    case 'yesterday':
      startDate = addDays(now, -1);
      endDate = addDays(now, -1);
      label = 'Yesterday';
      break;
    case 'this_week':
    case 'thisweek':
      startDate = startOfWeek(now);
      endDate = now;
      label = 'This Week';
      break;
    case 'last_week':
    case 'lastweek': {
      const thisWeekStart = startOfWeek(now);
      startDate = addDays(thisWeekStart, -7);
      endDate = addDays(thisWeekStart, -1);
      label = 'Last Week';
      break;
    }
    case 'last_month':
    case 'lastmonth': {
      const thisMonthStart = startOfMonth(now);
      startDate = startOfMonth(addDays(thisMonthStart, -1));
      endDate = addDays(thisMonthStart, -1);
      label = 'Last Month';
      break;
    }
    case 'this_quarter':
    case 'thisquarter':
      startDate = startOfQuarter(now);
      endDate = now;
      label = 'This Quarter';
      break;
    case 'last_quarter':
    case 'lastquarter': {
      const thisQuarterStart = startOfQuarter(now);
      endDate = addDays(thisQuarterStart, -1);
      startDate = startOfQuarter(endDate);
      label = 'Last Quarter';
      break;
    }
    case 'this_year':
    case 'thisyear':
      startDate = startOfYear(now);
      endDate = now;
      label = 'This Year';
      break;
    case 'last_year':
    case 'lastyear': {
      const thisYearStart = startOfYear(now);
      endDate = addDays(thisYearStart, -1);
      startDate = startOfYear(endDate);
      label = 'Last Year';
      break;
    }
    case 'custom':
      label = 'Custom Range';
      break;
    case 'this_month':
    case 'thismonth':
    default:
      startDate = startOfMonth(now);
      endDate = now;
      label = 'This Month';
      break;
  }

  return { startDate, endDate, label };
}
