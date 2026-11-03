import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createSalesInvoice,
  fetchCustomerById,
  fetchCustomers,
  fetchPaymentMethods,
} from '../../api/salesService';
import apiClient from '../../api/apiClient.js';
import { getCurrentUser } from '../../api/authService.js';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { isSalesAutoSyncEnabled, isSalesOfflineEnabled } from '../../offline/prefs.js';
import { formatCurrency, formatDisplayDate } from '../../data/salesMockData';
import { formatCustomerFullName } from '../../utils/customerDisplay';
import { displayCreditReviewStatus } from '../../utils/creditReview';
import { QuantityStepper } from '../shared/QuantityStepper.jsx';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';
import { LoadingState } from '../shared/LoadingState';
import { StatusBadge } from '../StatusBadge';
import { NavIcon } from '../../navIcons';

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addCalendarMonths(isoDate, months) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1 + Number(months || 0), day));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeInstallmentPreview(totalAmount, downPayment, termMonths) {
  const total = money(totalAmount);
  const down = money(downPayment);
  const months = Number(termMonths) || 0;
  const financed = money(Math.max(0, total - down));
  if (!months || months < 1) {
    return { total, down, financed, months: 0, monthly: 0, lastPayment: 0 };
  }
  const financedCents = Math.round(financed * 100);
  const baseCents = Math.floor(financedCents / months);
  const monthly = money(baseCents / 100);
  const lastPayment = money((financedCents - baseCents * (months - 1)) / 100);
  return { total, down, financed, months, monthly, lastPayment };
}

function customerLabel(customer) {
  if (!customer) return '';
  const formatted = formatCustomerFullName(customer);
  if (formatted && formatted !== '—') return formatted;
  return `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Customer';
}

function paymentStanding(outstanding) {
  const balance = money(outstanding);
  if (balance <= 0) return 'Current';
  return 'Has Balance';
}

function CustomerSearchSelect({
  value,
  selectedCustomer,
  locked,
  onSelect,
  onClear,
  disabled,
}) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (locked || disabled) return undefined;
    const term = query.trim();
    if (term.length < 1) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const result = await fetchCustomers({ search: term, limit: 20, status: 'Active' });
      if (cancelled) return;
      setResults(result.success ? result.data || [] : []);
      setSearching(false);
      setActiveIndex(0);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, locked, disabled]);

  useEffect(() => {
    const onDocMouseDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  if (locked || value) {
    return (
      <div className="log-sale-customer-selected">
        <strong>{customerLabel(selectedCustomer) || 'Selected customer'}</strong>
        {selectedCustomer?.contact_phone ? (
          <span className="muted"> · {selectedCustomer.contact_phone}</span>
        ) : null}
        {!locked ? (
          <button className="button ghost" type="button" onClick={onClear} style={{ marginLeft: 8 }}>
            Change
          </button>
        ) : null}
      </div>
    );
  }

  const choose = (customer) => {
    onSelect?.(customer);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="search-bar product-search-select log-sale-customer-search" ref={rootRef} style={{ flex: 1, minWidth: 240, maxWidth: '100%' }}>
      <NavIcon name="search" />
      <input
        className="search-input"
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder="Search customer name or phone…"
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === 'Enter' && results[activeIndex]) {
            e.preventDefault();
            choose(results[activeIndex]);
          }
        }}
      />
      {open && query.trim() ? (
        <ul className="search-suggestions product-search-select-menu" role="listbox">
          {searching ? (
            <li className="product-search-select-empty" role="presentation">Searching…</li>
          ) : null}
          {!searching && !results.length ? (
            <li className="product-search-select-empty" role="presentation">No matching customers</li>
          ) : null}
          {results.map((customer, index) => (
            <li key={customer.customer_id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`search-suggestion-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(customer)}
              >
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{customerLabel(customer)}</strong>
                  {customer.contact_phone ? (
                    <span className="mono-cell" style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                      {customer.contact_phone}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CustomerStatusPanel({
  customerDetail,
  creditContext,
  loading,
  totalAmount,
  payType,
  navigate,
  onRequestCreditReview,
}) {
  if (loading) {
    return (
      <section className="panel content-panel log-sale-status-panel">
        <div className="panel-section-header">
          <h3>Customer status</h3>
        </div>
        <LoadingState message="Loading customer status…" />
      </section>
    );
  }

  if (!customerDetail) {
    return (
      <section className="panel content-panel log-sale-status-panel">
        <div className="panel-section-header">
          <h3>Customer status</h3>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Select or add a customer to see balance and credit.
        </p>
      </section>
    );
  }

  const outstanding = money(customerDetail.activity?.outstanding_balance ?? customerDetail.outstandingBalance ?? 0);
  const hasCreditRow = Boolean(customerDetail.creditInfo);
  const creditLimit = money(customerDetail.creditInfo?.credit_limit || 0);
  const creditUsed = Math.min(outstanding, creditLimit || outstanding);
  const creditRemaining = hasCreditRow && creditLimit > 0 ? Math.max(0, creditLimit - outstanding) : null;
  const afterSale = money(outstanding + money(totalAmount));
  const exceeds = hasCreditRow && creditLimit > 0 && afterSale > creditLimit;
  const lastCollection = customerDetail.activity?.last_collection_date || null;
  const lastSale = customerDetail.activity?.last_sales_visit || null;
  const pending = creditContext?.pending_review || null;
  const riskLevel = creditContext?.risk?.level || null;
  const needsReview = payType === 'installment' && (
    !hasCreditRow
    || creditLimit <= 0
    || exceeds
    || Boolean(pending)
  );

  return (
    <section className="panel content-panel log-sale-status-panel">
      <div className="panel-section-header">
        <h3>Customer status</h3>
        <p className="muted">{customerLabel(customerDetail)}</p>
      </div>
      <div className="log-sale-status-rows">
        <div>
          <span className="muted">Status</span>
          <div><StatusBadge status={customerDetail.status || 'Active'} /></div>
        </div>
        <div>
          <span className="muted">Outstanding Balance</span>
          <strong>{formatCurrency(outstanding)}</strong>
        </div>
        <div>
          <span className="muted">Credit Limit</span>
          <strong>{hasCreditRow && creditLimit > 0 ? formatCurrency(creditLimit) : 'No credit on file'}</strong>
        </div>
        <div>
          <span className="muted">Credit Used / Remaining</span>
          <strong>
            {hasCreditRow && creditLimit > 0
              ? `${formatCurrency(creditUsed)} / ${formatCurrency(creditRemaining)}`
              : '—'}
          </strong>
        </div>
        <div>
          <span className="muted">After This Sale</span>
          <strong style={{ color: exceeds ? 'var(--danger, #b42318)' : undefined }}>
            {formatCurrency(afterSale)}
            {exceeds ? ' · exceeds limit' : ''}
          </strong>
        </div>
        <div>
          <span className="muted">Payment Standing</span>
          <strong>{paymentStanding(outstanding)}</strong>
        </div>
        <div>
          <span className="muted">Risk</span>
          <div>{riskLevel ? <StatusBadge status={riskLevel} /> : '—'}</div>
        </div>
        <div>
          <span className="muted">Credit Review</span>
          <div>
            {pending
              ? <StatusBadge status={displayCreditReviewStatus(pending.status)} />
              : 'None pending'}
          </div>
        </div>
        <div>
          <span className="muted">Last Collection / Sale</span>
          <strong>
            {[
              lastCollection ? `Collected ${formatDisplayDate(lastCollection)}` : null,
              lastSale ? `Sold ${formatDisplayDate(lastSale)}` : null,
            ].filter(Boolean).join(' · ') || '—'}
          </strong>
        </div>
      </div>
      {payType === 'installment' && (!hasCreditRow || creditLimit <= 0) ? (
        <p className="form-error" style={{ marginTop: 12 }}>
          Request a Credit Review / wait for Branch Manager to set a credit limit before installment.
        </p>
      ) : null}
      {payType === 'installment' && exceeds ? (
        <p className="form-error" style={{ marginTop: 12 }}>
          Projected outstanding exceeds this customer&apos;s credit limit. Request a Credit Review if a higher limit is needed.
        </p>
      ) : null}
      {payType === 'installment' && pending ? (
        <p className="muted" style={{ marginTop: 12 }}>
          A credit review is awaiting Branch Manager. Submitting a request does not unlock installment sales until BM decides.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(`/sales/customer-detail/${customerDetail.customer_id}?from=log-sale`)}
        >
          View Customer
        </button>
        {needsReview ? (
          <button className="button" type="button" onClick={onRequestCreditReview}>
            Request Credit Review
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function LogSalePage({
  customerId,
  navigate,
  showToast,
}) {
  const location = useLocation();
  const currentUser = getCurrentUser();
  const today = manilaToday();
  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [creditContext, setCreditContext] = useState(null);
  const [creditReviewOpen, setCreditReviewOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: customerId ? String(customerId) : '',
    payType: 'full',
    paymentMethodId: '',
    invoicesDate: today,
    dueDate: '',
    downPayment: '0',
    termMonths: '3',
    firstDueDate: addCalendarMonths(today, 1),
    notes: '',
  });
  const [lineItems, setLineItems] = useState([{ productId: '', quantity: 1 }]);
  const [errors, setErrors] = useState({});
  const [deviceSales, setDeviceSales] = useState([]);

  const fullPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => String(method.method_name || '').toLowerCase() !== 'credit'),
    [paymentMethods]
  );

  const totalAmount = useMemo(() => lineItems.reduce((sum, line) => {
    const product = products.find((p) => String(p.product_id) === String(line.productId));
    const quantity = Number(line.quantity) || 0;
    const unitPrice = product ? Number(product.unit_price) : 0;
    return sum + unitPrice * quantity;
  }, 0), [lineItems, products]);

  const installment = useMemo(
    () => computeInstallmentPreview(totalAmount, form.downPayment, form.termMonths),
    [totalAmount, form.downPayment, form.termMonths]
  );

  useEffect(() => {
    if (customerId) {
      setForm((prev) => ({ ...prev, customerId: String(customerId) }));
    }
  }, [customerId]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.payType !== 'installment') return prev;
      if (prev.firstDueDate) return prev;
      return { ...prev, firstDueDate: addCalendarMonths(prev.invoicesDate || today, 1) };
    });
  }, [form.payType, form.invoicesDate, today]);

  useEffect(() => {
    async function loadCustomerDetail(id) {
      if (!id) {
        setCustomerDetail(null);
        setSelectedCustomer(null);
        setCreditContext(null);
        return;
      }
      setCustomerDetailLoading(true);
      const result = await fetchCustomerById(id);
      let context = null;
      try {
        const contextRes = await apiClient.get(`/sales/customers/${id}/credit-review-context`);
        if (contextRes.data?.success) context = contextRes.data.data;
      } catch {
        context = null;
      }
      setCustomerDetailLoading(false);
      setCreditContext(context);
      if (result.success && result.data) {
        setCustomerDetail(result.data);
        setSelectedCustomer(result.data);
      } else {
        setCustomerDetail(null);
        showToast?.(result.message || 'Could not load customer.', 'error');
      }
    }
    loadCustomerDetail(form.customerId);
  }, [form.customerId, showToast]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const paymentResult = await fetchPaymentMethods();
      if (paymentResult.success) setPaymentMethods(paymentResult.data || []);
      try {
        // Same /products?branch_id=… source as Sales Inventory / BM / Warehouse —
        // available_stock & stock_status stay aligned; do not invent a separate stock calc here.
        const params = { limit: 200, product_status: 'Active' };
        if (currentUser?.branchId) params.branch_id = currentUser.branchId;
        const productResponse = await apiClient.get('/products', { params });
        if (productResponse.data?.success) {
          setProducts(productResponse.data.data || []);
        }
      } catch (err) {
        console.error('[LogSale] product load error:', err.message);
      }
      setDeviceSales(await loadWaiting('sales_invoices'));
      setLoading(false);
    }
    load();
  }, [currentUser?.branchId, showToast]);

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
    setErrors((prev) => ({ ...prev, items: undefined }));
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev, { productId: '', quantity: 1 }]);
  };

  const removeLineItem = (index) => {
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const availableProductsForLine = (index) => {
    const selectedIds = new Set(
      lineItems
        .map((line, i) => (i === index ? null : String(line.productId)))
        .filter(Boolean)
    );
    return products.filter((product) => {
      const id = String(product.product_id);
      if (selectedIds.has(id)) return false;
      return true;
    });
  };

  const buildValidation = () => {
    const nextErrors = {};
    if (!form.customerId) nextErrors.customerId = 'Select a customer.';
    if (!form.invoicesDate) nextErrors.invoicesDate = 'Invoice date is required.';
    if (!form.payType) nextErrors.payType = 'Select how the customer will pay.';

    const items = lineItems
      .filter((line) => line.productId)
      .map((line) => ({
        product_id: Number(line.productId),
        quantity: Number(line.quantity),
      }));
    if (!items.length) nextErrors.items = 'Add at least one product line.';

    const productIds = new Set();
    items.forEach((item) => {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        nextErrors.items = 'Each line must have a quantity of at least 1.';
      }
      if (productIds.has(item.product_id)) {
        nextErrors.items = 'Duplicate products are not allowed.';
      }
      productIds.add(item.product_id);
      const product = products.find((p) => Number(p.product_id) === item.product_id);
      const stock = Number(product?.available_stock ?? product?.quantity ?? 0);
      if (!product) {
        nextErrors.items = 'Select a valid product for every line.';
      } else if (stock <= 0) {
        nextErrors.items = `${product.product_name} has no available stock.`;
      } else if (item.quantity > stock) {
        nextErrors.items = `Quantity for ${product.product_name} exceeds available stock (${stock}).`;
      }
    });

    if (form.payType === 'full') {
      if (!form.paymentMethodId) nextErrors.paymentMethodId = 'Select a payment method.';
      if (form.dueDate && form.dueDate < form.invoicesDate) {
        nextErrors.dueDate = 'Due date cannot be earlier than the invoice date.';
      }
    } else {
      const months = Number(form.termMonths);
      if (!Number.isInteger(months) || months < 1 || months > 24) {
        nextErrors.termMonths = 'Months must be a whole number from 1 to 24.';
      }
      const down = money(form.downPayment);
      if (down < 0) nextErrors.downPayment = 'Down payment cannot be negative.';
      if (down >= money(totalAmount) && money(totalAmount) > 0) {
        nextErrors.downPayment = 'Down payment must be less than the invoice total.';
      }
      if (!form.firstDueDate) nextErrors.firstDueDate = 'First due date is required.';
      if (form.firstDueDate && form.firstDueDate < form.invoicesDate) {
        nextErrors.firstDueDate = 'First due date cannot be earlier than the invoice date.';
      }
      if (down > 0 && !form.paymentMethodId) {
        nextErrors.paymentMethodId = 'Select a down payment method.';
      }
      const creditLimit = money(customerDetail?.creditInfo?.credit_limit || 0);
      const outstanding = money(customerDetail?.activity?.outstanding_balance || 0);
      if (!customerDetail?.creditInfo || creditLimit <= 0) {
        nextErrors.payType = 'Request a Credit Review / wait for Branch Manager to set a credit limit before installment.';
      } else if (outstanding + money(totalAmount) > creditLimit) {
        nextErrors.payType = 'Projected outstanding exceeds this customer’s credit limit. Request a Credit Review if needed.';
      } else if (
        creditContext?.pending_review
        && (creditContext.pending_review.risk_level === 'High' || creditContext?.risk?.level === 'High')
      ) {
        nextErrors.payType = 'A high-risk Credit Review is pending Branch Manager decision.';
      }
    }

    return { nextErrors, items };
  };

  const buildPayload = (items) => ({
    customer_id: Number(form.customerId),
    payment_method_id: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
    invoices_date: form.invoicesDate,
    due_date: form.payType === 'full' ? (form.dueDate || undefined) : form.firstDueDate,
    notes: form.notes,
    items,
    customer_name: customerLabel(selectedCustomer || customerDetail) || 'Sale',
    pay_type: form.payType,
    down_payment: form.payType === 'installment' ? money(form.downPayment) : 0,
    term_months: form.payType === 'installment' ? Number(form.termMonths) : undefined,
    monthly_amount: form.payType === 'installment' ? installment.monthly : undefined,
    first_due_date: form.payType === 'installment' ? form.firstDueDate : undefined,
  });

  const keepLocal = async (payload) => {
    if (!isSalesOfflineEnabled()) {
      showToast('Turn on offline mode in Settings to keep this sale on the device.', 'error');
      return false;
    }
    await saveOfflineRecord({ tableName: 'sales_invoices', payload: { ...payload, saved_offline: true } });
    showToast(
      isSalesAutoSyncEnabled()
        ? 'Saved on this device. It will sync when you are online.'
        : 'Saved on this device. Send it from Settings while auto-sync is off.',
      'success'
    );
    setDeviceSales(await loadWaiting('sales_invoices'));
    return true;
  };

  const handleSubmitClick = () => {
    const { nextErrors } = buildValidation();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmedSubmit = async () => {
    const { nextErrors, items } = buildValidation();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setConfirmOpen(false);
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }
    const payload = buildPayload(items);
    setConfirmOpen(false);

    if (!isBrowserOnline()) {
      await keepLocal(payload);
      return;
    }

    setSubmitting(true);
    const result = await createSalesInvoice(payload);
    setSubmitting(false);
    if (!result.success || !result.data) {
      if (result.offline) {
        await keepLocal(payload);
        return;
      }
      showToast(result.message || 'Failed to log sale.', 'error');
      return;
    }
    showToast(result.message || 'Sale logged successfully.', 'success');
    navigate(`/sales/invoices/${encodeURIComponent(result.data.invoice_number)}`);
  };

  const handleCancel = () => {
    if (customerId || form.customerId) {
      navigate(`/sales/customer-detail/${customerId || form.customerId}`);
      return;
    }
    navigate('/sales/dashboard');
  };

  const confirmMessage = (() => {
    const name = customerLabel(selectedCustomer || customerDetail) || 'this customer';
    const total = formatCurrency(totalAmount);
    if (form.payType === 'installment') {
      return `Submit ${total} for ${name}: ${formatCurrency(installment.down)} down payment + ${formatCurrency(installment.monthly)} × ${installment.months} months? Stock will be deducted and the invoice will be submitted for Branch Head review.`;
    }
    return `Submit ${total} for ${name} (Pay in Full)? Stock will be deducted and the invoice will be submitted for Branch Head review.`;
  })();

  if (loading) return <LoadingState message="Loading log a sale form..." />;

  return (
    <div className="page">
      <DeviceQueue rows={deviceSales} />

      <div className="log-sale-layout">
        <div className="log-sale-main">
          <section className="panel form-panel content-panel">
            <div className="panel-section-header">
              <h3>Log a Sale</h3>
              <p className="muted">
                Invoice a customer, set how they will pay (full or monthly), and submit for Branch Head review.
              </p>
            </div>

            <div className="field-report-form">
              <div className="form-group field-report-block">
                <label htmlFor="log-sale-customer">Customer *</label>
                <div className="log-sale-customer-row">
                  <CustomerSearchSelect
                    value={form.customerId}
                    selectedCustomer={selectedCustomer || customerDetail}
                    onSelect={(customer) => {
                      setSelectedCustomer(customer);
                      setForm((prev) => ({ ...prev, customerId: String(customer.customer_id) }));
                      setErrors((prev) => ({ ...prev, customerId: undefined }));
                    }}
                    onClear={() => {
                      setSelectedCustomer(null);
                      setCustomerDetail(null);
                      setForm((prev) => ({ ...prev, customerId: '' }));
                    }}
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => navigate(`/sales/customers/new?returnTo=${encodeURIComponent(location.pathname + location.search)}`)}
                  >
                    Add New Customer
                  </button>
                </div>
                {errors.customerId ? <p className="form-error">{errors.customerId}</p> : null}
              </div>

              <div className="field-report-filter-row log-sale-terms-row">
                <label className="field-report-field" htmlFor="log-sale-pay-type">
                  <span>Pay Type *</span>
                  <select
                    id="log-sale-pay-type"
                    className="filter-select"
                    value={form.payType}
                    onChange={(e) => {
                      const payType = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        payType,
                        paymentMethodId: '',
                        firstDueDate: prev.firstDueDate || addCalendarMonths(prev.invoicesDate || today, 1),
                      }));
                      setErrors((prev) => ({ ...prev, payType: undefined, paymentMethodId: undefined }));
                    }}
                  >
                    <option value="full">Pay in Full</option>
                    <option value="installment">Installment (Monthly)</option>
                  </select>
                  {errors.payType ? <p className="form-error">{errors.payType}</p> : null}
                </label>

                <label className="field-report-field" htmlFor="log-sale-date">
                  <span>Invoice Date *</span>
                  <input
                    id="log-sale-date"
                    className="filter-input"
                    type="date"
                    value={form.invoicesDate}
                    onChange={(e) => setForm((prev) => ({
                      ...prev,
                      invoicesDate: e.target.value,
                      firstDueDate: prev.payType === 'installment' && !prev.firstDueDate
                        ? addCalendarMonths(e.target.value, 1)
                        : prev.firstDueDate,
                    }))}
                  />
                  {errors.invoicesDate ? <p className="form-error">{errors.invoicesDate}</p> : null}
                </label>
              </div>

              {form.payType === 'full' ? (
                <div className="field-report-filter-row log-sale-terms-row">
                  <label className="field-report-field" htmlFor="log-sale-payment">
                    <span>Payment Method *</span>
                    <select
                      id="log-sale-payment"
                      className="filter-select"
                      value={form.paymentMethodId}
                      onChange={(e) => {
                        setForm((prev) => ({ ...prev, paymentMethodId: e.target.value }));
                        setErrors((prev) => ({ ...prev, paymentMethodId: undefined }));
                      }}
                    >
                      <option value="">Select payment method</option>
                      {fullPaymentMethods.map((method) => (
                        <option key={method.payment_method_id} value={method.payment_method_id}>
                          {method.method_name}
                        </option>
                      ))}
                    </select>
                    {errors.paymentMethodId ? <p className="form-error">{errors.paymentMethodId}</p> : null}
                  </label>
                  <label className="field-report-field" htmlFor="log-sale-due">
                    <span>Due Date (optional)</span>
                    <input
                      id="log-sale-due"
                      className="filter-input"
                      type="date"
                      min={form.invoicesDate}
                      value={form.dueDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    />
                    {errors.dueDate ? <p className="form-error">{errors.dueDate}</p> : null}
                  </label>
                </div>
              ) : (
                <>
                  <div className="field-report-filter-row log-sale-installment-row">
                    <label className="field-report-field" htmlFor="log-sale-down">
                      <span>Down Payment</span>
                      <input
                        id="log-sale-down"
                        className="filter-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.downPayment}
                        onChange={(e) => setForm((prev) => ({ ...prev, downPayment: e.target.value }))}
                      />
                      {errors.downPayment ? <p className="form-error">{errors.downPayment}</p> : null}
                    </label>
                    <label className="field-report-field" htmlFor="log-sale-months">
                      <span>Months *</span>
                      <input
                        id="log-sale-months"
                        className="filter-input"
                        type="number"
                        min="1"
                        max="24"
                        step="1"
                        value={form.termMonths}
                        onChange={(e) => setForm((prev) => ({ ...prev, termMonths: e.target.value }))}
                      />
                      {errors.termMonths ? <p className="form-error">{errors.termMonths}</p> : null}
                    </label>
                    <label className="field-report-field" htmlFor="log-sale-first-due">
                      <span>First Due Date *</span>
                      <input
                        id="log-sale-first-due"
                        className="filter-input"
                        type="date"
                        min={form.invoicesDate}
                        value={form.firstDueDate}
                        onChange={(e) => setForm((prev) => ({ ...prev, firstDueDate: e.target.value }))}
                      />
                      {errors.firstDueDate ? <p className="form-error">{errors.firstDueDate}</p> : null}
                    </label>
                    {money(form.downPayment) > 0 ? (
                      <label className="field-report-field" htmlFor="log-sale-down-method">
                        <span>Down Payment Method *</span>
                        <select
                          id="log-sale-down-method"
                          className="filter-select"
                          value={form.paymentMethodId}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, paymentMethodId: e.target.value }));
                            setErrors((prev) => ({ ...prev, paymentMethodId: undefined }));
                          }}
                        >
                          <option value="">Select method</option>
                          {fullPaymentMethods.map((method) => (
                            <option key={method.payment_method_id} value={method.payment_method_id}>
                              {method.method_name}
                            </option>
                          ))}
                        </select>
                        {errors.paymentMethodId ? <p className="form-error">{errors.paymentMethodId}</p> : null}
                      </label>
                    ) : null}
                  </div>

                  <div className="log-sale-installment-preview">
                    <div className="panel-section-header">
                      <h4 className="subsection-title">Installment preview</h4>
                    </div>
                    <div className="log-sale-status-rows">
                      <div><span className="muted">Invoice Total</span><strong>{formatCurrency(installment.total)}</strong></div>
                      <div><span className="muted">Down Payment</span><strong>{formatCurrency(installment.down)}</strong></div>
                      <div><span className="muted">Financed Amount</span><strong>{formatCurrency(installment.financed)}</strong></div>
                      <div><span className="muted">Months</span><strong>{installment.months || '—'}</strong></div>
                      <div><span className="muted">Monthly Amount</span><strong>{formatCurrency(installment.monthly)}</strong></div>
                      <div><span className="muted">First Due Date</span><strong>{form.firstDueDate ? formatDisplayDate(form.firstDueDate) : '—'}</strong></div>
                    </div>
                    {installment.months > 0 ? (
                      <p className="muted" style={{ marginTop: 10 }}>
                        {formatCurrency(installment.monthly)}/month for {installment.months} months after {formatCurrency(installment.down)} down payment.
                        {installment.lastPayment !== installment.monthly ? (
                          <> Final month {formatCurrency(installment.lastPayment)} to clear rounding.</>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              <div className="form-group field-report-block">
                <label htmlFor="log-sale-notes">Notes</label>
                <textarea
                  id="log-sale-notes"
                  placeholder="Delivery notes or extra terms..."
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          </section>

          <section className="panel content-panel">
            <div className="panel-section-header">
              <h3>Line Items</h3>
              <button className="button secondary" type="button" onClick={addLineItem}>Add Product</button>
            </div>
            {errors.items ? <p className="form-error">{errors.items}</p> : null}
            <div className="table-shell">
              <table className="corvex-table log-sale-lines-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Available Stock</th>
                    <th>Unit Price</th>
                    <th>Qty</th>
                    <th>Line Total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((line, index) => {
                    const product = products.find((p) => String(p.product_id) === String(line.productId));
                    const unitPrice = product ? Number(product.unit_price) : 0;
                    const quantity = Number(line.quantity) || 0;
                    const stock = Number(product?.available_stock ?? product?.quantity ?? 0);
                    const lineTotal = unitPrice * quantity;
                    const options = availableProductsForLine(index);
                    return (
                      <tr key={`line-${index}`}>
                        <td>
                          <select
                            className="filter-select"
                            value={line.productId}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const nextProduct = products.find((p) => String(p.product_id) === String(nextId));
                              const nextStock = Number(nextProduct?.available_stock ?? nextProduct?.quantity ?? 0);
                              updateLineItem(index, 'productId', nextId);
                              if (nextId && nextStock > 0 && quantity > nextStock) {
                                updateLineItem(index, 'quantity', nextStock);
                              }
                            }}
                          >
                            <option value="">Select product</option>
                            {options.map((p) => {
                              const available = Number(p.available_stock ?? p.quantity ?? 0);
                              const disabled = available <= 0 && String(p.product_id) !== String(line.productId);
                              return (
                                <option key={p.product_id} value={p.product_id} disabled={disabled}>
                                  {p.product_name}{available <= 0 ? ' (out of stock)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                        <td>{product ? stock : '—'}</td>
                        <td>{product ? formatCurrency(unitPrice) : '—'}</td>
                        <td>
                          <QuantityStepper
                            value={line.quantity}
                            min={1}
                            max={product ? Math.max(stock, 1) : undefined}
                            onChange={(next) => {
                              const capped = product ? Math.min(Number(next) || 1, Math.max(stock, 0) || 1) : next;
                              updateLineItem(index, 'quantity', capped);
                            }}
                            aria-label={`Quantity for line ${index + 1}`}
                          />
                        </td>
                        <td>{product ? formatCurrency(lineTotal) : '—'}</td>
                        <td>
                          <button
                            className="button ghost"
                            type="button"
                            onClick={() => removeLineItem(index)}
                            disabled={lineItems.length <= 1}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Invoice total: <strong>{formatCurrency(totalAmount)}</strong>
            </p>
          </section>

          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button className="button secondary" type="button" onClick={handleCancel}>Cancel</button>
            <button className="button" type="button" onClick={handleSubmitClick} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Sale'}
            </button>
          </div>
        </div>

        <CustomerStatusPanel
          customerDetail={customerDetail}
          creditContext={creditContext}
          loading={customerDetailLoading}
          totalAmount={totalAmount}
          payType={form.payType}
          navigate={navigate}
          onRequestCreditReview={() => {
            if (creditContext?.pending_review?.ci_id) {
              navigate(`/sales/credit-investigations/${creditContext.pending_review.ci_id}`);
              return;
            }
            setCreditReviewOpen(true);
          }}
        />
      </div>

      <CreditReviewRequestModal
        open={creditReviewOpen}
        customer={customerDetail}
        onClose={() => setCreditReviewOpen(false)}
        showToast={showToast}
        defaultReason={
          !customerDetail?.creditInfo || money(customerDetail?.creditInfo?.credit_limit || 0) <= 0
            ? 'First installment'
            : 'Customer over limit but wants another sale'
        }
        onSubmitted={(ciId) => {
          setCreditReviewOpen(false);
          if (ciId) navigate(`/sales/credit-investigations/${ciId}`);
        }}
      />

      {confirmOpen ? (
        <div className="modal-overlay" onClick={() => !submitting && setConfirmOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Confirm sale</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{confirmMessage}</p>
            <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
              <button className="button secondary" type="button" disabled={submitting} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
              <button className="button" type="button" disabled={submitting} onClick={handleConfirmedSubmit}>
                {submitting ? 'Submitting…' : 'Submit Sale'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
