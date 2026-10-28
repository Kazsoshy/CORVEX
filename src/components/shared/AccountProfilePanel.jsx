import { useCallback, useEffect, useState } from 'react';
import { Lock, MonitorSmartphone, Settings, UserRound } from 'lucide-react';
import { persistCurrentUserFromProfile, requestLogout } from '../../api/authService';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService';
import { formatDisplayDate, formatDisplayDateTime } from '../../utils/formatters';
import { LoadingState } from './LoadingState';
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
  { id: 'account', label: 'Account', detail: 'Name, contact, and role', icon: UserRound },
  { id: 'security', label: 'Security', detail: 'Replace your password', icon: Lock },
  { id: 'session', label: 'Session', detail: 'This sign-in and sign out', icon: MonitorSmartphone },
  { id: 'settings', label: 'Settings', detail: 'Display, reading, and alerts', icon: Settings },
];

function buildDraft(profile) {
  return {
    first_name: profile?.first_name || '',
    middle_name: profile?.middle_name || '',
    last_name: profile?.last_name || '',
    email: profile?.email || '',
    phone: profile?.phone || '',
  };
}

function fullNameFrom(profile) {
  if (profile?.full_name) return profile.full_name;
  return [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).join(' ');
}

/**
 * Shared staff profile for viewing and updating the signed-in account.
 */
export function AccountProfilePanel({
  showToast,
  title = 'Profile',
  subtitle = 'Your name, contact details, and sign-in for this CORVEX account.',
  extraActions = null,
  settingsRole = 'personal',
  settings = null,
}) {
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState('account');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [passwordDirty, setPasswordDirty] = useState(false);
  const remaining = useIdleRemaining();
  const onPasswordDirty = useCallback((dirty) => setPasswordDirty(dirty), []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchMyProfile();
    if (res.success && res.data) {
      setProfile(res.data);
      setDraft(buildDraft(res.data));
      setLoadError('');
    } else {
      setLoadError(res.message || 'Could not load your profile.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function run() {
      const res = await fetchMyProfile();
      if (!active) return;
      if (res.success && res.data) {
        setProfile(res.data);
        setDraft(buildDraft(res.data));
        setLoadError('');
      } else {
        setLoadError(res.message || 'Could not load your profile.');
      }
      setLoading(false);
    }
    run();
    return () => { active = false; };
  }, []);

  const accountDirty = editing && draft && JSON.stringify(draft) !== JSON.stringify(buildDraft(profile));

  const changeSection = (next) => {
    if (next === section) return;
    if (accountDirty || passwordDirty) {
      showToast?.('Save or clear your changes before leaving this section.', 'error');
      return;
    }
    setSection(next);
  };

  const cancelEdit = () => {
    setDraft(buildDraft(profile));
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setDraft(buildDraft(profile));
        setEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, profile]);

  const saveProfile = async () => {
    if (!draft) return;
    if (!String(draft.first_name || '').trim() || !String(draft.last_name || '').trim()) {
      showToast?.('First name and last name are required.', 'error');
      return;
    }
    const email = String(draft.email || '').trim();
    if (!isValidEmail(email)) {
      showToast?.('Enter a valid email address.', 'error');
      return;
    }
    setSaving(true);
    const res = await updateMyProfile({
      first_name: String(draft.first_name).trim(),
      middle_name: String(draft.middle_name || '').trim() || null,
      last_name: String(draft.last_name).trim(),
      email,
      phone: String(draft.phone || '').trim() || null,
    });
    setSaving(false);
    if (!res.success) {
      showToast?.(res.message || 'Update failed.', 'error');
      return;
    }
    persistCurrentUserFromProfile(res.data);
    setProfile(res.data);
    setDraft(buildDraft(res.data));
    setEditing(false);
    showToast?.(res.message || 'Profile updated.', 'success');
  };

  if (loading) return <LoadingState message="Loading profile…" />;
  if (loadError || !profile) {
    return (
      <div className="page settings-page profile-page">
        <section className="settings-card">
          <header>
            <h4>Profile unavailable</h4>
            <p>{loadError || 'Could not load your profile.'}</p>
          </header>
          <div className="settings-card-footer">
            <button className="button" type="button" onClick={load}>Try again</button>
          </div>
        </section>
      </div>
    );
  }

  const displayName = fullNameFrom(profile) || 'User';
  const idleLabel = formatIdleRemaining(remaining);
  const activeTab = TABS.find((tab) => tab.id === section) || TABS[0];

  return (
    <div className="page settings-page profile-page">
      <header className="settings-hero profile-hero">
        <div className="profile-identity">
          <ProfilePhotoEditor
            name={displayName}
            showToast={showToast}
            onUpdated={(data) => {
              if (!data) return;
              setProfile(data);
              setDraft(buildDraft(data));
            }}
          />
          <div>
            <p className="settings-kicker">{title}</p>
            <h2>{displayName}</h2>
            <p className="muted">{subtitle}</p>
          </div>
        </div>
        <div className="settings-hero-meta">
          <StatusBadge status={profile.status || '—'} />
          <span className="settings-pill">{profile.role?.name || 'Staff'}</span>
          <span className="settings-pill">{profile.branch?.name || 'Head Office'}</span>
        </div>
      </header>

      <div className="settings-shell">
        <ProfileTabs
          label="Profile sections"
          tabs={TABS}
          active={section}
          onChange={changeSection}
          idPrefix="profile"
        />

        <div
          className="settings-stage"
          role="tabpanel"
          id={`profile-panel-${section}`}
          aria-labelledby={`profile-tab-${section}`}
        >
          <div className="settings-stage-head">
            <h3>{activeTab.label}</h3>
            <p className="muted">{activeTab.detail}</p>
          </div>

          {section === 'account' ? (
            <section className="settings-card">
              <header>
                <h4>{editing ? 'Edit account' : 'Account details'}</h4>
                <p>Role and branch are assigned by your organization. Name, email, and phone can be updated here.</p>
              </header>
              <div className="settings-card-body">
                {editing && draft ? (
                  <div className="form-grid profile-form">
                    <label>First name
                      <input value={draft.first_name} onChange={(event) => setDraft((current) => ({ ...current, first_name: event.target.value }))} autoComplete="given-name" />
                    </label>
                    <label>Middle name
                      <input value={draft.middle_name} onChange={(event) => setDraft((current) => ({ ...current, middle_name: event.target.value }))} autoComplete="additional-name" />
                    </label>
                    <label>Last name
                      <input value={draft.last_name} onChange={(event) => setDraft((current) => ({ ...current, last_name: event.target.value }))} autoComplete="family-name" />
                    </label>
                    <label>Email
                      <input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} autoComplete="email" />
                    </label>
                    <label>Phone
                      <input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" />
                    </label>
                    <label>Role
                      <input value={profile.role?.name || ''} readOnly />
                    </label>
                    <label>Branch
                      <input value={profile.branch?.name || 'Head Office'} readOnly />
                    </label>
                    <label>User ID
                      <input value={String(profile.user_id)} readOnly />
                    </label>
                  </div>
                ) : (
                  <div className="profile-facts">
                    <ProfileFact label="Full name" value={displayName} />
                    <ProfileFact label="User ID" value={String(profile.user_id)} copyText={String(profile.user_id)} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Email" value={profile.email} copyText={profile.email} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Phone" value={profile.phone} copyText={profile.phone || ''} onCopy={(value, label) => copyProfileValue(value, label, showToast)} />
                    <ProfileFact label="Role" value={profile.role?.name} />
                    <ProfileFact label="Branch" value={profile.branch?.name || 'Head Office'} />
                    <ProfileFact label="Member since" value={formatDisplayDate(profile.created_at)} />
                    <ProfileFact label="Last sign-in" value={formatDisplayDateTime(profile.last_login)} />
                    <ProfileFact label="Profile updated" value={formatDisplayDateTime(profile.updated_at)} />
                  </div>
                )}
              </div>
              <div className="settings-card-footer">
                {editing ? (
                  <>
                    <button className="button ghost" type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>
                    <button className="button" type="button" onClick={saveProfile} disabled={saving}>
                      {saving ? 'Saving…' : 'Save profile'}
                    </button>
                  </>
                ) : (
                  <button className="button" type="button" onClick={() => { setDraft(buildDraft(profile)); setEditing(true); }}>
                    Update profile
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {section === 'security' ? (
            <ProfilePasswordForm showToast={showToast} onDirtyChange={onPasswordDirty} onUpdated={(data) => {
              if (data) {
                setProfile(data);
                setDraft(buildDraft(data));
              }
            }} />
          ) : null}

          {section === 'session' ? (
            <section className="settings-card">
              <header>
                <h4>This sign-in</h4>
                <p>CORVEX ends a sign-in after 15 minutes without activity. Use a shared computer only while you are at it, then sign out.</p>
              </header>
              <div className="settings-card-body">
                <div className="profile-facts">
                  <ProfileFact label="Browser" value={browserLabel()} />
                  <ProfileFact label="Time left if you step away" value={idleLabel || 'Ends after 15 minutes of inactivity'} />
                  <ProfileFact label="Last sign-in recorded" value={formatDisplayDateTime(profile.last_login)} />
                  <ProfileFact label="Signed in as" value={profile.email} />
                </div>
              </div>
              <div className="settings-card-footer">
                {extraActions}
                <button className="button ghost" type="button" onClick={() => requestLogout()}>Sign out</button>
              </div>
            </section>
          ) : null}

          {section === 'settings' ? (
            settings || <UserSettingsPanel embedded role={settingsRole} showToast={showToast} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
