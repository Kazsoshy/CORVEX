export const customerRole = {
  key: 'customer',
  label: 'Customer',
  homePath: '/customer',
  entryPath: '/customer/home',
  loginPath: '/customer/login',
  accent: 'Self-service payments and receipts',
  navPages: [
    { label: 'Home', to: '/customer/home' },
    { label: 'Account Details', to: '/customer/account-details' },
    { label: 'Payment History', to: '/customer/payment-history' },
    { label: 'Digital Receipts', to: '/customer/receipts' },
    { label: 'Statements', to: '/customer/statements' },
    { label: 'Notifications', to: '/customer/notifications' },
    { label: 'Profile', to: '/customer/profile' },
  ],
  routes: {},
};
