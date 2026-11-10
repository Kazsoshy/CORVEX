const menu = [
  { label: 'Dashboard', to: '/customer/dashboard' },
  { label: 'My Purchases', to: '/customer/purchases' },
  { label: 'Outstanding Balances', to: '/customer/balances' },
  { label: 'Payment History', to: '/customer/payment-history' },
  { label: 'Notifications', to: '/customer/notifications' },
  { label: 'Customer Support', to: '/customer/support' },
];

const accountMenu = [
  { label: 'My Profile', to: '/customer/my-profile' },
  { label: 'Account Settings', to: '/customer/account-settings' },
];

export const customerRole = {
  key: 'customer',
  label: 'Customer',
  homePath: '/customer',
  entryPath: '/customer/dashboard',
  loginPath: '/customer/login',
  accent: 'Balances, purchases, and payments',
  navSections: [
    { title: 'Home', items: menu },
    { title: 'Account', items: accountMenu },
  ],
  navPages: [...menu, ...accountMenu],
  routes: {},
};
