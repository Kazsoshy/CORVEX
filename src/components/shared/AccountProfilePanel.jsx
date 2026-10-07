import { useEffect, useState } from 'react';
import { fetchMyProfile, updateMyProfile } from '../../api/profileService';
import { persistCurrentUserFromProfile, requestLogout } from '../../api/authService';
import { LoadingState } from './LoadingState';

export function AccountProfilePanel({ showToast, title = 'Profile' }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [focusPassword, setFocusPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetchMyProfile();
      if (!active) return;
      if (res.success && res.data) setProfile(res.data);
      else setLoadError(res.message || 'Could not load your profile.');
    }
    load();
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!profile) return;
    if (password.trim() && password.trim().length < 8) {
      showToast?.('Password must be at least 8 characters.', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      phone: profile.phone,
    };
    if (password.trim()) payload.password = password.trim();
    const res = await updateMyProfile(payload);
    setSaving(false);
    if (res.success) {
      persistCurrentUserFromProfile(res.data);
      setProfile(res.data);
      setPassword('');
      setEditing(false);
      setFocusPassword(false);
      showToast?.(password.trim() ? 'Password updated.' : 'Profile updated.', 'success');
    } else {
      showToast?.(res.message || 'Update failed.', 'error');
    }
  };

  if (!profile && !loadError) return <LoadingState message="Loading profile..." />;
  if (loadError) {
    return <section className="panel content-panel"><p>{loadError}</p></section>;
  }

  const fullName = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ');
  return (
    <div className="relative z-10 grid gap-[22px] w-full">
      <section className="panel content-panel relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center mb-4">
          <h3>{title}</h3>
        </div>
        {editing ? (
          <div className="form-grid">
            <label>First name<input value={profile.first_name || ''} onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))} /></label>
            <label>Last name<input value={profile.last_name || ''} onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))} /></label>
            <label>Email<input type="email" value={profile.email || ''} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></label>
            <label>Phone<input value={profile.phone || ''} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} /></label>
            <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" autoFocus={focusPassword} /></label>
          </div>
        ) : (
          <ul className="info-grid">
            <li><span className="info-item-label">Name</span><span className="info-item-value">{fullName || '—'}</span></li>
            <li><span className="info-item-label">User ID</span><span className="info-item-value">{profile.user_id}</span></li>
            <li><span className="info-item-label">Email</span><span className="info-item-value">{profile.email || '—'}</span></li>
            <li><span className="info-item-label">Phone</span><span className="info-item-value">{profile.phone || '—'}</span></li>
            <li><span className="info-item-label">Role</span><span className="info-item-value">{profile.role?.name || '—'}</span></li>
            <li><span className="info-item-label">Branch</span><span className="info-item-value">{profile.branch?.name || 'Head Office'}</span></li>
          </ul>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button className="button ghost" type="button" onClick={() => requestLogout()}>Logout</button>
          {editing ? (
            <>
              <button className="button ghost" type="button" onClick={() => { setEditing(false); setPassword(''); setFocusPassword(false); }}>Cancel</button>
              <button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          ) : (
            <>
              <button className="button secondary" type="button" onClick={() => { setFocusPassword(true); setEditing(true); }}>Change Password</button>
              <button className="button" type="button" onClick={() => { setFocusPassword(false); setEditing(true); }}>Update Profile</button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
