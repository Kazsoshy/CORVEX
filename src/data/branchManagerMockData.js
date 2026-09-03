// Branch Manager Data - Now using real database data via API
// Mock data kept only for CI queue and audit logs which need dedicated tables

export const BRANCH_MANAGER_PROFILE = {
  name: null, // Populated from getCurrentUser()
  employeeId: null,
  branch: null,
  email: null,
  phone: null,
  avatarInitials: null,
};

export const BRANCH_ANALYTICS = {
  healthScore: 0,
  collectionEfficiency: 0,
  salesEfficiency: 0,
  inventoryHealth: 0,
  collectionRateToday: 0,
  routeCompliance: 0,
  salesVisitCompletion: 0,
  stockAlertsCount: 0,
  pendingCI: 0,
  overdueAccounts: 0,
  totalCollectionsToday: 0,
  totalSalesToday: 0,
  activeCollectors: 0,
  activeSalesAgents: 0,
};

export const COLLECTORS = []; // Populated from API
export const SALES_AGENTS = []; // Populated from API
export const MAP_ACCOUNTS = []; // Populated from API
export const ALERTS = []; // Populated from API
export const NOTIFICATIONS = []; // Would need notifications table

export const CI_QUEUE = [
  {
    id: 'ci1',
    customerName: 'Sample Customer',
    submittedBy: 'Staff Name',
    submissionDate: '2026-06-24',
    delinquencyStatus: 'Clear',
    status: 'Pending',
    monthlyIncome: 0,
    businessType: 'Business Type',
    purpose: 'Credit Request',
    references: 'Pending',
    paymentHistory: [],
    delinquencyFlags: [],
    leafletClassification: 'Moderate',
    riskScore: 0,
    formRemarks: 'Sample CI request - needs dedicated table',
  },
];

export const PENDING_APPROVALS = {
  ci: CI_QUEUE.filter((c) => c.status === 'Pending').length,
  transfers: 0,
  specialCollections: 0,
};

export const AUDIT_LOGS = [
  { id: 'ba1', action: 'Login', detail: 'User logged in', timestamp: '2026-06-26 06:00 PM' },
];

export const TRENDS = {
  delinquency:    [0, 0, 0, 0, 0, 0, 0],
  routeCompliance:[0, 0, 0, 0, 0, 0, 0],
  sales:    [0, 0, 0, 0, 0, 0, 0],
  collection:[0, 0, 0, 0, 0, 0, 0],
};

export const DAILY_COLLECTION = [
  { day: 'Mon', amount: 0, target: 0 },
  { day: 'Tue', amount: 0, target: 0 },
  { day: 'Wed', amount: 0, target: 0 },
  { day: 'Thu', amount: 0, target: 0 },
  { day: 'Fri', amount: 0, target: 0 },
  { day: 'Sat', amount: 0, target: 0 },
  { day: 'Today', amount: 0, target: 0 },
];

export const WEEKLY_SALES = [
  { day: 'Mon', actual: 0, target: 0 },
  { day: 'Tue', actual: 0, target: 0 },
  { day: 'Wed', actual: 0, target: 0 },
  { day: 'Thu', actual: 0, target: 0 },
  { day: 'Fri', actual: 0, target: 0 },
  { day: 'Sat', actual: 0, target: 0 },
  { day: 'Today', actual: 0, target: 0 },
];

export const COLLECTOR_PERFORMANCE_CHART = [];
export const DELINQUENCY_TREND = [];
export const COMPLIANCE_TREND = [];

export function formatCurrency(amount) { return `₱${Number(amount).toLocaleString('en-PH')}`; }
export function getCollectorById(id)   { return COLLECTORS.find((c) => c.id === String(id)) ?? null; }
export function getSalesAgentById(id)  { return SALES_AGENTS.find((a) => a.id === String(id)) ?? null; }
export function getCIById(id)          { return CI_QUEUE.find((c) => c.id === String(id)) ?? null; }
export function getMapAccountById(id)  { return MAP_ACCOUNTS.find((a) => a.id === String(id)) ?? null; }
export function getAlertById(id)       { return ALERTS.find((a) => a.id === String(id)) ?? null; }
