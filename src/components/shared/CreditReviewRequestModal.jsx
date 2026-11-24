import { useEffect, useMemo, useState } from 'react';
import { submitSalesCreditInvestigation } from '../../api/salesService';
import { CREDIT_REVIEW_REASONS } from '../../utils/creditReview';
import { formatCustomerFullName, formatCustomerDisplayId } from '../../utils/customerDisplay';

const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled', 'Divorced'];
const EMPLOYMENT_STATUSES = [
  'Employed', 'Self-Employed', 'Business Owner', 'OFW', 'Retired', 'Unemployed', 'Student', 'Other',
];
const GOVERNMENT_ID_TYPES = [
  "Driver's License", 'Passport', 'UMID', 'PhilSys ID', 'SSS ID', 'TIN ID',
  "Voter's ID", 'Postal ID', 'PRC ID', 'Senior Citizen ID', 'Other Government ID',
];

function customerHasApprovedCredit(customer) {
  const limit = Number(
    customer?.credit_limit
    ?? customer?.creditLimit
    ?? customer?.creditInfo?.credit_limit
    ?? customer?.credit_info?.credit_limit
    ?? 0
  );
  return Number.isFinite(limit) && limit > 0;
}

function emptyProfile(customer) {
  const c = customer || {};
  const employment = c.registration_profile_json?.employment
    || c.registrationProfile?.employment
    || c.registration_profile?.employment
    || {};
  const altName = [
    c.contact_person_fname,
    c.contact_person_mname,
    c.contact_person_lname,
  ].filter(Boolean).join(' ').trim();
  return {
    civil_status: c.civil_status || '',
    mothers_maiden_name: c.mothers_maiden_name || '',
    alternate_contact_name: altName,
    alternate_contact_phone: c.contact_person_phone || '',
    alternate_contact_relationship: c.contact_person_relationship || '',
    employment_status: employment.status || c.employment_status || c.creditInfo?.employment_status || '',
    employer_or_occupation: employment.employer_or_occupation || '',
    monthly_income: employment.monthly_income != null && employment.monthly_income !== ''
      ? String(employment.monthly_income)
      : (c.creditInfo?.monthly_income != null
        ? String(c.creditInfo.monthly_income)
        : (c.monthly_income != null ? String(c.monthly_income) : '')),
    id_type: c.id_type || '',
    id_number: c.id_number || '',
    id_photo: c.id_photo || '',
  };
}

/**
 * Lightweight SA request — reason required; limit + remarks optional.
 * First-time credit (no approved limit) collects KYC/employment/ID, including revise/resubmit.
 */
export function CreditReviewRequestModal({
  customer,
  open,
  onClose,
  onSubmitted,
  showToast,
  defaultReason = '',
  defaultRequestedLimit = '',
  defaultRemarks = '',
  resubmitCiId = null,
  recommendationId = null,
  isFirstCredit = null,
}) {
  const firstCredit = useMemo(() => {
    if (typeof isFirstCredit === 'boolean') return isFirstCredit;
    return !customerHasApprovedCredit(customer);
  }, [isFirstCredit, customer]);

  const isResubmit = Boolean(resubmitCiId);
  const showCreditProfile = firstCredit;

  const resolvedDefaultReason = firstCredit
    ? 'First installment'
    : (
      defaultReason && defaultReason !== 'First installment'
        ? defaultReason
        : 'Need higher limit'
    );

  const reasonOptions = firstCredit
    ? ['First installment']
    : CREDIT_REVIEW_REASONS.filter((option) => option !== 'First installment');

  const [reason, setReason] = useState(resolvedDefaultReason);
  const [requestedLimit, setRequestedLimit] = useState('');
  const [remarks, setRemarks] = useState('');
  const [profile, setProfile] = useState(() => emptyProfile(customer));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoReplaced, setPhotoReplaced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(resolvedDefaultReason);
    setRequestedLimit(
      defaultRequestedLimit != null && defaultRequestedLimit !== ''
        ? String(defaultRequestedLimit)
        : ''
    );
    setRemarks(defaultRemarks || '');
    setProfile(emptyProfile(customer));
    setPhotoReplaced(false);
    setError('');
  }, [
    open,
    resolvedDefaultReason,
    customer,
    recommendationId,
    resubmitCiId,
    defaultRequestedLimit,
    defaultRemarks,
  ]);

  if (!open || !customer) return null;

  const customerId = customer.customer_id || customer.customerId;
  const name = formatCustomerFullName(customer);
  const code = formatCustomerDisplayId(customer);
  const hasExistingPhoto = Boolean(profile.id_photo) && !photoReplaced;

  const updateProfile = (key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const handleIdPhoto = (file) => {
    if (!file) {
      if (hasExistingPhoto && !photoReplaced) return;
      updateProfile('id_photo', '');
      setPhotoReplaced(false);
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      setError('Government ID photo must be an image file.');
      return;
    }
    if (file.size > 700_000) {
      setError('Government ID photo is too large. Use a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateProfile('id_photo', String(reader.result || ''));
      setPhotoReplaced(true);
    };
    reader.onerror = () => setError('Could not read ID photo.');
    reader.readAsDataURL(file);
  };

  const validateProfile = () => {
    if (!profile.civil_status) return 'Civil status is required.';
    if (!String(profile.mothers_maiden_name || '').trim()) return "Mother's maiden name is required.";
    if (!String(profile.alternate_contact_name || '').trim()) return 'Alternate contact name is required.';
    if (!String(profile.alternate_contact_phone || '').trim()) return 'Alternate contact phone is required.';
    if (!String(profile.alternate_contact_relationship || '').trim()) return 'Alternate contact relationship is required.';
    if (!profile.employment_status) return 'Employment status is required.';
    if (!String(profile.employer_or_occupation || '').trim()) return 'Employer or occupation is required.';
    if (!(Number(profile.monthly_income) > 0)) return 'Monthly income must be a positive amount.';
    if (!profile.id_type) return 'Government ID type is required.';
    if (!String(profile.id_number || '').trim()) return 'Government ID number is required.';
    if (!profile.id_photo) return 'Government ID photo is required.';
    return '';
  };

  const handleSubmit = async () => {
    if (!reason) {
      setError('Select a reason for this credit review.');
      return;
    }
    if (showCreditProfile) {
      const profileError = validateProfile();
      if (profileError) {
        setError(profileError);
        return;
      }
    }
    setSubmitting(true);
    setError('');

    const creditProfilePayload = showCreditProfile
      ? {
        ...profile,
        mothers_maiden_name: String(profile.mothers_maiden_name || '').trim(),
        alternate_contact_name: String(profile.alternate_contact_name || '').trim(),
        alternate_contact_phone: String(profile.alternate_contact_phone || '').trim(),
        alternate_contact_relationship: String(profile.alternate_contact_relationship || '').trim(),
        employer_or_occupation: String(profile.employer_or_occupation || '').trim(),
        monthly_income: Number(profile.monthly_income),
        id_number: String(profile.id_number || '').trim(),
        // Only send a new data-URL when replaced; otherwise backend keeps on-file photo.
        id_photo: photoReplaced && String(profile.id_photo || '').startsWith('data:image/')
          ? profile.id_photo
          : (String(profile.id_photo || '').startsWith('data:image/') ? profile.id_photo : ''),
      }
      : null;

    const result = await submitSalesCreditInvestigation({
      customer_id: customerId,
      request_reason: showCreditProfile ? 'First installment' : reason,
      requested_credit_limit: requestedLimit !== '' ? Number(requestedLimit) : null,
      request_remarks: remarks.trim() || null,
      resubmit_ci_id: resubmitCiId || undefined,
      recommendation_id: recommendationId || customer?._recommendationId || undefined,
      ...(creditProfilePayload ? { credit_profile: creditProfilePayload } : {}),
    });
    setSubmitting(false);

    if (!result.success) {
      const message = result.message || 'Failed to submit credit review.';
      setError(message);
      showToast?.(message, 'error');
      if (result.data?.ci_id) {
        onSubmitted?.(result.data.ci_id, { alreadyPending: true });
      }
      return;
    }

    showToast?.(
      result.message
        || (isResubmit
          ? 'Revised credit review resubmitted for Branch Manager decision.'
          : 'Credit review submitted for Branch Manager decision.'),
      'success'
    );
    onSubmitted?.(result.data?.ci_id, { resubmitted: Boolean(result.data?.resubmitted) });
    onClose?.();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="credit-review-request-title" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: showCreditProfile ? 640 : 480, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="credit-review-request-title">
            {isResubmit ? 'Revise credit application' : 'Apply for Credit'}
          </h3>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {name}{code !== '—' ? ` · ${code}` : ''}
            {isResubmit ? ` · CI #${resubmitCiId}` : ''}
          </p>
        </div>
        <p className="muted">
          {isResubmit
            ? 'Edit the fields below using the Branch Manager revision instructions. The same investigation returns to Pending with a refreshed snapshot.'
            : showCreditProfile
              ? 'First installment needs civil status, alternate contact, employment, and government ID so Branch Manager has a complete credit profile. Limit suggestion still uses ~30% of income/revenue minus obligations (₱1,000–₱50,000 policy cap) — BM still approves.'
              : 'Branch Manager decides the approved limit. The system may suggest from ~30% of income/revenue minus obligations (₱1,000–₱50,000 policy cap) — BM still approves.'}
        </p>

        <div className="form-group">
          <label htmlFor="cr-reason">Reason *</label>
          <select
            id="cr-reason"
            className="filter-select"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(''); }}
            disabled={showCreditProfile}
          >
            {!showCreditProfile ? <option value="">Select reason</option> : null}
            {reasonOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        {showCreditProfile ? (
          <div className="form-panel" style={{ marginTop: 8, padding: 12 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Personal</h4>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label htmlFor="cr-civil">Civil status *</label>
                <select
                  id="cr-civil"
                  className="filter-select"
                  value={profile.civil_status}
                  onChange={(e) => updateProfile('civil_status', e.target.value)}
                >
                  <option value="">Select</option>
                  {CIVIL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cr-maiden">Mother&apos;s maiden name *</label>
                <input
                  id="cr-maiden"
                  type="text"
                  value={profile.mothers_maiden_name}
                  onChange={(e) => updateProfile('mothers_maiden_name', e.target.value)}
                />
              </div>
            </div>

            <h4 style={{ margin: '14px 0 10px', fontSize: 14 }}>Alternate contact</h4>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label htmlFor="cr-alt-name">Contact name *</label>
                <input
                  id="cr-alt-name"
                  type="text"
                  value={profile.alternate_contact_name}
                  onChange={(e) => updateProfile('alternate_contact_name', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cr-alt-phone">Phone *</label>
                <input
                  id="cr-alt-phone"
                  type="text"
                  value={profile.alternate_contact_phone}
                  onChange={(e) => updateProfile('alternate_contact_phone', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="cr-alt-rel">Relationship *</label>
                <input
                  id="cr-alt-rel"
                  type="text"
                  value={profile.alternate_contact_relationship}
                  onChange={(e) => updateProfile('alternate_contact_relationship', e.target.value)}
                />
              </div>
            </div>

            <h4 style={{ margin: '14px 0 10px', fontSize: 14 }}>Employment</h4>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label htmlFor="cr-emp">Employment status *</label>
                <select
                  id="cr-emp"
                  className="filter-select"
                  value={profile.employment_status}
                  onChange={(e) => updateProfile('employment_status', e.target.value)}
                >
                  <option value="">Select</option>
                  {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cr-job">Employer / occupation *</label>
                <input
                  id="cr-job"
                  type="text"
                  value={profile.employer_or_occupation}
                  onChange={(e) => updateProfile('employer_or_occupation', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="cr-income">Monthly income (₱) *</label>
                <input
                  id="cr-income"
                  type="number"
                  min="0"
                  step="0.01"
                  value={profile.monthly_income}
                  onChange={(e) => updateProfile('monthly_income', e.target.value)}
                />
              </div>
            </div>

            <h4 style={{ margin: '14px 0 10px', fontSize: 14 }}>Government ID</h4>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label htmlFor="cr-id-type">ID type *</label>
                <select
                  id="cr-id-type"
                  className="filter-select"
                  value={profile.id_type}
                  onChange={(e) => updateProfile('id_type', e.target.value)}
                >
                  <option value="">Select</option>
                  {GOVERNMENT_ID_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="cr-id-num">ID number *</label>
                <input
                  id="cr-id-num"
                  type="text"
                  value={profile.id_number}
                  onChange={(e) => updateProfile('id_number', e.target.value)}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="cr-id-photo">
                  ID photo {isResubmit && hasExistingPhoto ? '(on file — optional replace)' : '*'}
                </label>
                <input
                  id="cr-id-photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleIdPhoto(e.target.files?.[0] || null)}
                />
                {profile.id_photo ? (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {photoReplaced ? 'New photo attached.' : 'Photo on file.'}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="form-group">
          <label htmlFor="cr-limit">Requested credit limit (₱) — optional</label>
          <input
            id="cr-limit"
            type="number"
            min="0"
            step="0.01"
            placeholder="Leave blank if BM should decide"
            value={requestedLimit}
            onChange={(e) => setRequestedLimit(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="cr-remarks">Short remarks — optional</label>
          <textarea
            id="cr-remarks"
            rows={3}
            placeholder="Anything BM should know from the field"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="button secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="button" type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? 'Submitting…'
              : (isResubmit ? 'Resubmit for BM' : 'Submit application')}
          </button>
        </div>
      </div>
    </div>
  );
}
