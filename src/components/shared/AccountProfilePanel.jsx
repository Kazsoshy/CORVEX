import { useEffect, useState } from 'react';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService';
import { persistCurrentUserFromProfile, requestLogout } from '../../api/authService';
import { LoadingState } from './LoadingState';

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

function initialsFrom(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Shared staff profile panel for FR-08 (view) and FR-09 (update + password).
 */
export function AccountProfilePanel({
  showToast,
  title = 'Profile',
  subtitle = 'View and update your personal account details.',
  extraActions = null,
}) {
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState(null);
  const [mode, setMode] = useState('view'); // view | edit | password
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchMyProfile();
      if (!active) return;
      if (res.success && res.data) {
        setProfile(res.data);
        setDraft(buildDraft(res.data));
        setLoadError('');
      } else {
        setLoadError(res.message || 'Could not load your profile.');
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const resetPasswordFields = () => {
    setCurrentPassword('');
    setPassword('');
    setConfirmPassword('');
  };

  const cancel = () => {
    setDraft(buildDraft(profile));
    resetPasswordFields();
    setMode('view');
  };

  const saveProfile = async () => {
    if (!draft) return;
    if (!String(draft.first_name || '').trim() || !String(draft.last_name || '').trim()) {
      showToast?.('First name and last name are required.', 'error');
      return;
    }
    if (!String(draft.email || '').trim()) {
      showToast?.('Email is required.', 'error');
      return;
    }
    setSaving(true);
    const res = await updateMyProfile({
      first_name: String(draft.first_name).trim(),
      middle_name: String(draft.middle_name || '').trim() || null,
      last_name: String(draft.last_name).trim(),
      email: String(draft.email).trim(),
      phone: String(draft.phone || '').trim() || null,
    });
    setSaving(false);
    if (res.success) {
      persistCurrentUserFromProfile(res.data);
      setProfile(res.data);
      setDraft(buildDraft(res.data));
      setMode('view');
      showToast?.(res.message || 'Profile updated.', 'success');
    } else {
      showToast?.(res.message || 'Update failed.', 'error');
    }
  };

  const savePassword = async () => {
    if (!currentPassword) {
      showToast?.('Enter your current password.', 'error');
      return;
    }
    if (password.trim().length < 8) {
      showToast?.('New password must be at least 8 characters.', 'error');
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      showToast?.('New password and confirmation do not match.', 'error');
      return;
    }
    setSaving(true);
    const res = await updateMyProfile({
      current_password: currentPassword,
      password: password.trim(),
      confirm_password: confirmPassword.trim(),
    });
    setSaving(false);
    if (res.success) {
      resetPasswordFields();
      setMode('view');
      if (res.data) {
        persistCurrentUserFromProfile(res.data);
        setProfile(res.data);
      }
      showToast?.(res.message || 'Password updated.', 'success');
    } else {
      showToast?.(res.message || 'Password update failed.', 'error');
    }
  };

  if (!profile && !loadError) return <LoadingState message="Loading profile..." />;
  if (loadError) {
    return (
      <section className="panel content-panel">
        <p>{loadError}</p>
      </section>
    );
  }

  const displayName = fullNameFrom(profile) || 'User';
  const initials = initialsFrom(displayName);

  return (
    <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel profile-panel">
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div>
            <h3>{title}</h3>
            <p className="muted" style={{ margin: '4px 0 0' }}>{subtitle}</p>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.82rem' }}>
              {displayName} · {profile.role?.name || 'Staff'}
            </p>
          </div>
        </div>

        {mode === 'view' && (
          <ul className="info-grid" style={{ marginTop: 16 }}>
            <li><span className="info-item-label">Full name</span><span className="info-item-value">{displayName || '—'}</span></li>
            <li><span className="info-item-label">User ID</span><span className="info-item-value">{profile.user_id}</span></li>
            <li><span className="info-item-label">Email</span><span className="info-item-value">{profile.email || '—'}</span></li>
            <li><span className="info-item-label">Phone</span><span className="info-item-value">{profile.phone || '—'}</span></li>
            <li><span className="info-item-label">Role</span><span className="info-item-value">{profile.role?.name || '—'}</span></li>
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{profile.branch?.name || 'Head Office'}</span></li>
            <li><span className="info-item-label">Status</span><span className="info-item-value">{profile.status || '—'}</span></li>
          </ul>
        )}

        {mode === 'edit' && draft && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label>First name
              <input
                value={draft.first_name}
                onChange={(e) => setDraft((p) => ({ ...p, first_name: e.target.value }))}
                autoComplete="given-name"
              />
            </label>
            <label>Middle name
              <input
                value={draft.middle_name}
                onChange={(e) => setDraft((p) => ({ ...p, middle_name: e.target.value }))}
                autoComplete="additional-name"
              />
            </label>
            <label>Last name
              <input
                value={draft.last_name}
                onChange={(e) => setDraft((p) => ({ ...p, last_name: e.target.value }))}
                autoComplete="family-name"
              />
            </label>
            <label>Email
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                autoComplete="email"
              />
            </label>
            <label>Phone
              <input
                value={draft.phone}
                onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                autoComplete="tel"
              />
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
        )}

        {mode === 'password' && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label>Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                autoComplete="new-password"
              />
            </label>
            <label>Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 mt-6">
          {extraActions}
          <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
          {mode === 'view' ? (
            <>
              <button className="button secondary" type="button" onClick={() => setMode('password')}>
                Change Password
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  setDraft(buildDraft(profile));
                  setMode('edit');
                }}
              >
                Update Profile
              </button>
            </>
          ) : (
            <>
              <button className="button ghost" type="button" onClick={cancel} disabled={saving}>Cancel</button>
              {mode === 'edit' ? (
                <button className="button" type="button" onClick={saveProfile} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Profile'}
                </button>
              ) : (
                <button className="button" type="button" onClick={savePassword} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Password'}
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
