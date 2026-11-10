/** Shared Field Activity Report labels for BM / Sales / Collector UIs. */

export const SALES_ACTIVITY_TYPES = [
  'Canvassing',
  'Follow-up',
  'Site Check',
  'No Prospects Found',
];

export const COLLECTOR_OUTCOME_TYPES = [
  'Collection',
  'Partial Collection',
  'Promise to Pay',
  'Customer Not Available',
  'Follow-up',
];

export const COLLECTOR_INCIDENT_TYPES = [
  'Payment Dispute',
  'Customer Refused',
  'Safety / Aggression',
  'Location Issue',
];

export const FAR_PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'all', label: 'All Reports' },
];

export const FAR_ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'collector', label: 'Collectors' },
  { value: 'sales', label: 'Sales Agents' },
];

export const FAR_SEVERITY_OPTIONS = [
  { value: 'all', label: 'All Severities' },
  { value: 'High', label: 'High' },
  { value: 'Critical', label: 'Critical' },
];

export const FAR_ACTIVITY_FILTER_GROUPS = [
  {
    label: 'Sales Agent Activities',
    options: SALES_ACTIVITY_TYPES,
  },
  {
    label: 'Collector Outcomes',
    options: COLLECTOR_OUTCOME_TYPES,
  },
  {
    label: 'Collector Incidents',
    options: COLLECTOR_INCIDENT_TYPES,
  },
];

export function isIncidentActivity(activityType) {
  return COLLECTOR_INCIDENT_TYPES.includes(String(activityType || '').trim());
}

export function severityTone(severity) {
  const value = String(severity || '').toLowerCase();
  if (value === 'critical') return 'critical';
  if (value === 'high') return 'high';
  return null;
}

export function reportPhotoSrc(photo) {
  if (typeof photo !== 'string') return '';
  if (photo.startsWith('data:image/') || photo.startsWith('http://') || photo.startsWith('https://')) return photo;
  return '';
}
