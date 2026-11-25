import { useEffect, useState } from 'react';
import {
  getBranchPaymentSettings,
  updateBranchPaymentSettings,
} from '../../api/branchManagerService';
import { LoadingState } from '../shared/LoadingState';

export function BranchPaymentSettingsPanel({ showToast }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [mobile, setMobile] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getBranchPaymentSettings();
      if (cancelled) return;
      setLoading(false);
      if (!result.success || !result.data) {
        setError(result.message || 'Could not load payment settings.');
        return;
      }
      setAccountName(result.data.gcash_account_name || '');
      setMobile(result.data.gcash_mobile || '');
      setQrImage(result.data.gcash_qr_image || '');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      showToast?.('Choose an image file for the GCash QR.', 'error');
      return;
    }
    if (file.size > 2_500_000) {
      showToast?.('QR image must be under 2.5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setQrImage(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = await updateBranchPaymentSettings({
      gcash_account_name: accountName,
      gcash_mobile: mobile,
      gcash_qr_image: qrImage,
    });
    setSaving(false);
    if (!result.success) {
      showToast?.(result.message || 'Failed to save payment settings.', 'error');
      return;
    }
    showToast?.(result.message || 'Branch payment settings saved.', 'success');
    if (result.data) {
      setAccountName(result.data.gcash_account_name || '');
      setMobile(result.data.gcash_mobile || '');
      setQrImage(result.data.gcash_qr_image || '');
    }
  }

  if (loading) return <LoadingState message="Loading branch payment settings…" />;

  return (
    <section className="panel content-panel" style={{ marginTop: 16 }}>
      <div className="list-section-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: 0 }}>Branch GCash / Spot Cash</h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Sales agents display this QR when logging Spot Cash GCash sales. Only Branch Managers can edit it.
          </p>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {!qrImage ? (
        <div className="log-sale-gcash-panel--empty" style={{ marginBottom: 12, padding: 12, borderRadius: 10 }}>
          Configure GCash QR before sales agents can take Spot Cash GCash.
        </div>
      ) : null}

      <form onSubmit={handleSave} className="branch-payment-settings-form">
        <div className="log-sale-gcash-panel__body" style={{ marginTop: 12 }}>
          <div>
            <label className="muted" htmlFor="bm-gcash-qr-file">QR image</label>
            <div className="log-sale-gcash-qr-wrap" style={{ marginTop: 6 }}>
              {qrImage ? (
                <img src={qrImage} alt="Branch GCash QR preview" className="log-sale-gcash-qr" />
              ) : (
                <span className="muted" style={{ padding: 24, textAlign: 'center' }}>No QR uploaded</span>
              )}
            </div>
            <input
              id="bm-gcash-qr-file"
              type="file"
              accept="image/*"
              style={{ marginTop: 8 }}
              onChange={onPickImage}
            />
            {qrImage ? (
              <button
                className="button ghost"
                type="button"
                style={{ marginTop: 6 }}
                onClick={() => setQrImage('')}
              >
                Remove QR
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="bm-gcash-name">Account name</label>
              <input
                id="bm-gcash-name"
                className="filter-input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Branch GCash account name"
                maxLength={120}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="bm-gcash-mobile">Mobile / number</label>
              <input
                id="bm-gcash-mobile"
                className="filter-input"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="09XXXXXXXXX"
                maxLength={30}
              />
            </div>
            <div>
              <span className="muted">Sales agent preview</span>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                SA sees the QR, account name, and number on the Log Sale payment step. They cannot edit these fields.
              </p>
            </div>
            <div>
              <button className="button" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save GCash settings'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
