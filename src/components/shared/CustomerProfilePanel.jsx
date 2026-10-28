import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, MonitorSmartphone, Settings, UserRound } from 'lucide-react';
import { fetchMyProfile } from '../../api/profileService';
import { fetchCustomerPortalMe, updateCustomerPortalContact } from '../../api/customerPortalService';
import { requestLogout } from '../../api/authService';
import { formatCurrency, formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { StatusBadge } from '../StatusBadge';
import { ProfilePhotoEditor } from './ProfilePhoto';
import { UserSettingsPanel } from './UserSettingsPanel';
import {
  ProfileFact,
  ProfilePasswordForm,
  ProfileTabs,
  browserLabel,
  copyProfileValue,
  formatIdleRemaining,
  isValidEmail,
  useIdleRemaining,
} from './profileParts';

const TABS = [
  { id: 'account', label: 'Account', detail: 'Name, contact, and address', icon: UserRound },
  { id: 'security', label: 'Security', detail: 'Replace your password', icon: Lock },
  { id: 'activity', label: 'Activity', detail: 'Balances and this sign-in', icon: MonitorSmartphone },
  { id: 'settings', label: 'Settings', detail: 'Display, reading, and alerts', icon: Settings },
];

function customerName(account) {
  return [account?.first_name, account?.middle_name, account?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function CustomerProfilePanel({ showToast }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [contact, setContact] = useState({ phone: '', email: '' });
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState('account');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const remaining = useIdleRemaining();
  const onPasswordDirty = useCallback((dirty) => setPasswordDirty(dirty), []);

  const load = useCallback(async () => {
    setLoading(true);
    const [portal, me] = await Promise.all([fetchCustomerPortalMe(), fetchMyProfile()]);
    if (portal.success && portal.data) {
      setAccount(portal.data);
      setContact({
        phone: portal.data.contact_phone || '',
        email: portal.data.portal_email || '',
      });
    } else {
      setAccount(null);
    }
    if (me.success && me.data) setSessionUser(me.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function run() {
      const [portal, me] = await Promise.all([fetchCustomerPortalMe(), fetchMyProfile()]);
      if (!active) return;
      if (portal.success && portal.data) {
        setAccount(portal.data);
        setContact({
          phone: portal.data.contact_phone || '',
          email: portal.data.portal_email || '',
        });
      }
      if (me.success && me.data) setSessionUser(me.data);
      setLoading(false);
    }
    run();
    return () => { active = false; };
  }, []);

  const contactDirty = editing && (
    contact.phone !== (account?.contact_phone || '')
    || contact.email !== (account?.portal_email || '')
  );

  const changeSection = (next) => {
    if (next === section) return;
    if (contactDirty || passwordDirty) {
      showToast?.('Save or clear your changes before leaving this section.', 'error');
      return;
    }
    setSection(next);
  };

  const cancelEdit = () => {
    setContact({
      phone: account?.contact_phone || '',
      email: account?.portal_email || '',
    });
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') cancelEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const saveContact = async () => {
    const email = String(contact.email || '').trim();
    if (email && !isValidEmail(email)) {
      showToast?.('Enter a valid email address.', 'error');
      return;
    }
    setSaving(true);
    const result = await updateCustomerPortalContact({
      contact_phone: String(contact.phone || '').trim(),
      portal_email: email,
    });
    setSaving(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to update profile.', 'error');
      return;
    }
    setAccount(result.data);
    setContact({
      phone: result.data?.contact_phone || '',
      email: result.data?.portal_email || '',
    });
    setEditing(false);
    showToast?.(result.message || 'Profile updated.', 'success');
  };

  if (loading) return <LoadingState message="Loading profile…" />;
  if (!account) {
    return (
      <div className="page settings-page profile-page">
        <EmptyState title="Profile unavailable" description="Could not load your customer record." actionLabel="Try again" onAction={load} />
      </div>
    );
  }

  const name = customerName(account) || 'Customer';
  const signInEmail = sessionUser?.email || '';
  const portalEmail = account.portal_email || '';
  const emailsDiffer = signInEmail && portalEmail && signInEmail.toLowerCase() !== portalEmail.toLowerCase();
  const activeTab = TABS.find((tab) => tab.id === section) || TABS[0];
  const idleLabel = formatIdleRemaining(remaining);

  return (
    <div className="page customer-page settings-page profile-page">
      <header className="settings-hero profile-hero">
        <div className="profile-identity">
          <ProfilePhotoEditor name={name} showToast={showToast} />
          <div>
            <p className="settings-kicker">Customer profile</p>
            <h2>{name}</h2>
            <p className="muted">Contact details for your branch, and the password you use to sign in.</p>
          </div>
        </div>
        <div className="settings-hero-meta">
          <StatusBadge status={account.status || '—'} />
          <span className="settings-pill">{account.customer_code || `Account ${account.customer_id}`}</span>
          <span className="settings-pill">{account.branch_name || 'Branch'}</span>
        </div>
      </header>

      <div className="settings-shell">
        <ProfileTabs
          label="Profile sections"
          tabs={TABS}
          active={section}
          onChange={changeSection}
          idPrefix="customer-profile"
        />
        <div
          className="settings-stage"
          role="tabpanel"
          id={`customer-profile-panel-${section}`}
          aria-labelledby={`customer-profile-tab-${section}`}
        >
          <div className="settings-stage-head">
            <h3>{activeTab.label}</h3>
            <p className="muted">{activeTab.detail}</p>
          </div>

          {section === 'account' ? (
            <section className="settings-card">
              <header>
                <h4>{editing ? 'Edit contact' : 'Personal information'}</h4>
                <p>
                  {emailsDiffer
                    ? 'Your sign-in email and the email on your customer record are different. Updating contact details does not change the email you type at login.'
                    : 'Phone and contact email reach your branch. Address changes are made by the branch.'}
                </p>
              </header>
              <div className="settings-card-body">
                {editing ? (
                  <div className="form-grid profile-form">
                    <label>Phone
                      <input value={contact.phone} onChange={(event) => setContact((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" />
                    </label>
                    <label>Contact email
                      <input type="email" value={contact.email} onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
                    </label>
                    <label>Address
                      <input value={account.address || ''} readOnly />
                    </label>
                    <label>Sign-in email
                      <input value={signInEmail || '—'} readOnly />
                    </label>
                  </div>
                ) : (
                  <div className="profile-facts">
                    <ProfileFact label="Name" value={name} />
                    <ProfileFact
                      label="Account number"
                      value={account.customer_code || String(account.customer_id)}
                      copyText={account.customer_code || String(account.customer_id)}
                      onCopy={(value, label) => copyProfileValue(value, label, showToast)}
                    />
                    <ProfileFact label="Phone" value={account.contact_phone} copyText={account.contact_phone || ''} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Contact email" value={account.portal_email} copyText={account.portal_email || ''} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Sign-in email" value={signInEmail} copyText={signInEmail} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Address" value={account.address} />
                    <ProfileFact label="Branch" value={account.branch_name} />
                    <ProfileFact label="Portal status" value={<StatusBadge status={account.portal_status || '—'} />} />
                  </div>
                )}
              </div>
              <div className="settings-card-footer">
                {editing ? (
                  <>
                    <button className="button ghost" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                    <button className="button" type="button" onClick={saveContact} disabled={saving}>
                      {saving ? 'Saving…' : 'Save profile'}
                    </button>
                  </>
                ) : (
                  <button className="button" type="button" onClick={() => setEditing(true)}>Update profile</button>
                )}
              </div>
            </section>
          ) : null}

          {section === 'security' ? (
            <ProfilePasswordForm showToast={showToast} onDirtyChange={onPasswordDirty} />
          ) : null}

          {section === 'activity' ? (
            <>
              <section className="settings-card">
                <header>
                  <h4>Account snapshot</h4>
                  <p>A short view of this customer record. Open the full pages for payments and statements.</p>
                </header>
                <div className="settings-card-body">
                  <div className="profile-facts">
                    <ProfileFact label="Outstanding balance" value={formatCurrency(account.outstanding_balance)} />
                    <ProfileFact label="Purchase volume" value={formatCurrency(account.purchase_volume)} />
                    <ProfileFact label="Last collection" value={formatDisplayDate(account.last_collection_date)} />
                    <ProfileFact label="Last sales visit" value={formatDisplayDate(account.last_sales_visit)} />
                  </div>
                </div>
                <div className="settings-card-footer">
                  <button className="button secondary" type="button" onClick={() => navigate('/customer/account-details')}>Account details</button>
                  <button className="button ghost" type="button" onClick={() => navigate('/customer/payment-history')}>Payment history</button>
                </div>
              </section>
              <section className="settings-card">
                <header>
                  <h4>This sign-in</h4>
                  <p>CORVEX ends a sign-in after 15 minutes without activity.</p>
                </header>
                <div className="settings-card-body">
                  <div className="profile-facts">
                    <ProfileFact label="Browser" value={browserLabel()} />
                    <ProfileFact label="Time left if you step away" value={idleLabel || 'Ends after 15 minutes of inactivity'} />
                    <ProfileFact label="Last sign-in recorded" value={formatDisplayDateTime(sessionUser?.last_login)} />
                  </div>
                </div>
                <div className="settings-card-footer">
                  <button className="button ghost" type="button" onClick={() => requestLogout()}>Sign out</button>
                </div>
              </section>
            </>
          ) : null}

          {section === 'settings' ? (
            <UserSettingsPanel embedded role="customer" showToast={showToast} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
