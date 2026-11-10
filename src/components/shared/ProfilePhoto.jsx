import { useEffect, useState } from 'react';
import { persistCurrentUserFromProfile } from '../../api/authService';
import { deleteMyAvatar, fetchMyAvatarBlob, uploadMyAvatar } from '../../api/profileService';
import { confirmAction } from './confirmAction.jsx';
import { initialsFrom } from './profileParts';

let currentUrl = '';
let loadPromise = null;

function publish() {
  window.dispatchEvent(new Event('corvex-avatar-changed'));
}

function loadAvatar() {
  const request = fetchMyAvatarBlob().then((blob) => {
    if (loadPromise !== request) return currentUrl;
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = blob ? URL.createObjectURL(blob) : '';
    publish();
    return currentUrl;
  }).catch(() => {
    if (loadPromise === request) loadPromise = null;
    return currentUrl;
  });
  loadPromise = request;
  return request;
}

export function refreshMyAvatar() {
  loadPromise = null;
  return loadAvatar();
}

export function clearMyAvatar() {
  loadPromise = Promise.resolve('');
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = '';
  publish();
}

if (typeof window !== 'undefined') {
  window.addEventListener('corvex-signed-out', clearMyAvatar);
}

export function useMyAvatar(active = true) {
  const [src, setSrc] = useState(active ? currentUrl : '');

  useEffect(() => {
    if (!active) {
      setSrc('');
      return undefined;
    }
    let cancelled = false;
    const apply = () => {
      if (!cancelled) setSrc(currentUrl);
    };
    window.addEventListener('corvex-avatar-changed', apply);
    if (!loadPromise) loadAvatar();
    else loadPromise.then(apply);
    apply();
    return () => {
      cancelled = true;
      window.removeEventListener('corvex-avatar-changed', apply);
    };
  }, [active]);

  return src;
}

export function ProfilePhotoEditor({ name, showToast, onUpdated }) {
  const src = useMyAvatar(true);
  const [busy, setBusy] = useState(false);
  const initials = initialsFrom(name);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const namedOk = /\.(jpe?g|png|webp)$/i.test(file.name);
    const typedOk = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if ((file.type && !typedOk) || (!file.type && !namedOk)) {
      showToast?.('Choose a JPG, PNG, or WebP image.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast?.('Photo must be 2 MB or smaller.', 'error');
      return;
    }
    if (busy) return;
    const confirmed = await confirmAction({
      title: 'Update profile photo',
      message: 'This replaces the photo on your account.',
      detail: file.name,
      confirmLabel: 'Save photo',
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await uploadMyAvatar(file);
    setBusy(false);
    if (!result.success) {
      showToast?.(result.message || 'Could not save the photo.', 'error');
      return;
    }
    if (result.data) persistCurrentUserFromProfile(result.data);
    await refreshMyAvatar();
    onUpdated?.(result.data);
    showToast?.(result.message || 'Profile photo updated.', 'success');
  };

  const remove = async () => {
    if (busy) return;
    const confirmed = await confirmAction({
      title: 'Remove profile photo',
      message: 'Your account will show initials instead of a photo.',
      detail: name || 'Your account',
      confirmLabel: 'Remove photo',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusy(true);
    const result = await deleteMyAvatar();
    setBusy(false);
    if (!result.success) {
      showToast?.(result.message || 'Could not remove the photo.', 'error');
      return;
    }
    if (result.data) persistCurrentUserFromProfile(result.data);
    await refreshMyAvatar();
    onUpdated?.(result.data);
    showToast?.(result.message || 'Profile photo removed.', 'success');
  };

  return (
    <div className="profile-photo-wrap">
      <div className="profile-mark">
        {src ? <img src={src} alt="" /> : initials}
      </div>
      <div className="profile-photo-actions">
        <label className="profile-photo-btn">
          {busy ? 'Saving…' : 'Change photo'}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={choose}
            disabled={busy}
          />
        </label>
        {src ? (
          <button className="profile-photo-remove" type="button" onClick={remove} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
