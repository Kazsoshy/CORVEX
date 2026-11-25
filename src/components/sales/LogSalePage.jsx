import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  createSalesInvoice,
  fetchBranchPaymentSettings,
  fetchCustomerById,
  fetchPaymentMethods,
} from '../../api/salesService';
import apiClient from '../../api/apiClient.js';
import { getCurrentUser } from '../../api/authService.js';
import { isBrowserOnline } from '../../offline/connection.js';
import { saveOfflineRecord } from '../../offline/db.js';
import { DeviceQueue, loadWaiting } from '../../offline/DeviceQueue.jsx';
import { isSalesAutoSyncEnabled, isSalesOfflineEnabled } from '../../offline/prefs.js';
import {
  addCalendarMonths,
  clearLogSaleDraft,
  computeInstallmentPreview,
  createIdempotencyKey,
  evaluateCreditLimit,
  lineItemsInvoiceTotal,
  loadLogSaleDraft,
  manilaToday,
  money,
  queuedOfflineInstallmentCredit,
  saveLogSaleDraft,
} from '../../utils/calculateSale.js';
import { formatCurrency } from '../../utils/formatters.js';
import { CreditReviewRequestModal } from '../shared/CreditReviewRequestModal';
import { ConfirmModal } from '../shared/ConfirmModal';
import { LoadingState } from '../shared/LoadingState';
import { FindExistingCustomerModal } from './FindExistingCustomerModal';
import { CustomerCard } from './logSale/CustomerCard';
import { CustomerDetailsModal } from './logSale/CustomerDetailsModal';
import { LineItemsTable } from './logSale/LineItemsTable';
import { ProductPickerModal } from './logSale/ProductPickerModal';
import { PaymentSection } from './logSale/PaymentSection';
import { ScheduleModal } from './logSale/ScheduleModal';
import { EarlySettlementModal } from './logSale/EarlySettlementModal';
import { SaleSummaryCard } from './logSale/SaleSummaryCard';
import { ConfirmSubmitModal } from './logSale/ConfirmSubmitModal';

const EMPTY_LINE = () => ({ productId: '', quantity: 1, _key: createIdempotencyKey() });

export function LogSalePage({
  customerId,
  navigate,
  showToast,
}) {
  const location = useLocation();
  const currentUser = getCurrentUser();
  const today = manilaToday();
  const idempotencyRef = useRef(createIdempotencyKey());
  const undoTimerRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [customerDetailLoading, setCustomerDetailLoading] = useState(false);
  const [creditContext, setCreditContext] = useState(null);
  const [creditReviewOpen, setCreditReviewOpen] = useState(false);
  const [findModalOpen, setFindModalOpen] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [gcashReference, setGcashReference] = useState('');
  const [gcashPaymentProof, setGcashPaymentProof] = useState('');
  const [branchPaymentSettings, setBranchPaymentSettings] = useState(null);
  const [branchPaymentLoading, setBranchPaymentLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [form, setForm] = useState({
    customerId: customerId ? String(customerId) : '',
    payType: 'full',
    paymentMethodId: '',
    invoicesDate: today,
    dueDate: '',
    downPayment: '0',
    termMonths: '3',
    firstDueDate: addCalendarMonths(today, 1),
  });
  const [lineItems, setLineItems] = useState([EMPTY_LINE()]);
  const [errors, setErrors] = useState({});
  const [deviceSales, setDeviceSales] = useState([]);
  const [draftBanner, setDraftBanner] = useState(null);
  const [successInvoice, setSuccessInvoice] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [undoLine, setUndoLine] = useState(null);

  const fullPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => ['cash', 'gcash'].includes(
      String(method.method_name || '').trim().toLowerCase()
    )),
    [paymentMethods]
  );

  const totalAmount = useMemo(
    () => lineItemsInvoiceTotal(lineItems, products),
    [lineItems, products]
  );

  const installment = useMemo(
    () => computeInstallmentPreview(totalAmount, form.downPayment, form.termMonths),
    [totalAmount, form.downPayment, form.termMonths]
  );

  const pricingMatchesTotal = pricing && Math.abs(Number(pricing.originalTotal) - money(totalAmount)) < 0.01;
  const creditLimit = money(customerDetail?.creditInfo?.credit_limit || 0);
  const outstanding = money(customerDetail?.activity?.outstanding_balance || 0);
  const queuedCredit = queuedOfflineInstallmentCredit(deviceSales, form.customerId);
  const cartObligation = money(pricingMatchesTotal ? pricing?.finalObligation : totalAmount);
  const creditEval = evaluateCreditLimit({
    payType: form.payType,
    creditLimit,
    outstanding,
    queuedOfflineCredit: queuedCredit,
    cartObligation,
  });
  const creditLimitExceeded = creditEval.exceeded;

  const itemCount = lineItems.filter((l) => l.productId).length;
  const markDirty = () => setDirty(true);

  // Resume draft banner (once on mount)
  useEffect(() => {
    const draft = loadLogSaleDraft();
    if (!draft?.form) return;
    if (customerId) return;
    setDraftBanner(draft);
  }, [customerId]);

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

  const selectedMethodName = useMemo(() => {
    const method = fullPaymentMethods.find(
      (m) => String(m.payment_method_id) === String(form.paymentMethodId)
    );
    return String(method?.method_name || '').trim().toLowerCase();
  }, [fullPaymentMethods, form.paymentMethodId]);

  // Autosave draft
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(() => {
      saveLogSaleDraft({
        form,
        lineItems: lineItems.map(({ productId, quantity }) => ({ productId, quantity })),
        notes,
        gcashReference,
        gcashPaymentProof,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [dirty, form, lineItems, notes, gcashReference, gcashPaymentProof]);

  useEffect(() => {
    if (form.payType !== 'full' || selectedMethodName !== 'gcash') return undefined;
    let cancelled = false;
    (async () => {
      setBranchPaymentLoading(true);
      const result = await fetchBranchPaymentSettings();
      if (cancelled) return;
      setBranchPaymentLoading(false);
      setBranchPaymentSettings(result.success ? result.data : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [form.payType, selectedMethodName]);

  useEffect(() => {
    function onBeforeUnload(e) {
      if (!dirty || successInvoice) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, successInvoice]);

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
        const limit = money(result.data.creditInfo?.credit_limit || 0);
        if (limit > 0) {
          setForm((prev) => {
            if (prev.payType === 'installment') return prev;
            return {
              ...prev,
              payType: 'installment',
              paymentMethodId: '',
              firstDueDate: prev.firstDueDate || addCalendarMonths(prev.invoicesDate || today, 1),
            };
          });
        }
      } else {
        setCustomerDetail(null);
        showToast?.(result.message || 'Could not load customer.', 'error');
      }
    }
    loadCustomerDetail(form.customerId);
  }, [form.customerId, showToast, today]);

  useEffect(() => {
    const items = lineItems
      .filter((line) => line.productId)
      .map((line) => ({ product_id: Number(line.productId), quantity: Number(line.quantity) || 0 }));
    if (!items.length || !form.invoicesDate) {
      setPricing(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await apiClient.post('/sales/pricing/calculate', {
          customer_id: form.customerId ? Number(form.customerId) : undefined,
          pay_type: form.payType,
          invoices_date: form.invoicesDate,
          first_due_date: form.firstDueDate,
          items,
        });
        if (!cancelled && response.data?.success) {
          setPricing(response.data.data);
          if (response.data.data.termMonths) {
            setForm((prev) => ({ ...prev, termMonths: String(response.data.data.termMonths) }));
          }
        }
      } catch (error) {
        if (!cancelled) setPricing(null);
        console.error('[LogSale] pricing calculation error:', error.message);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.customerId, form.payType, form.invoicesDate, form.firstDueDate, lineItems]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const paymentResult = await fetchPaymentMethods();
      if (paymentResult.success) setPaymentMethods(paymentResult.data || []);
      try {
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
  }, [currentUser?.branchId]);

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }, []);

  function resumeDraft() {
    if (!draftBanner) return;
    setForm((prev) => ({ ...prev, ...draftBanner.form, invoicesDate: today }));
    setLineItems(
      (draftBanner.lineItems || []).length
        ? draftBanner.lineItems.map((l) => ({ ...l, _key: createIdempotencyKey() }))
        : [EMPTY_LINE()]
    );
    setNotes(draftBanner.notes || '');
    setGcashReference(draftBanner.gcashReference || '');
    setGcashPaymentProof(draftBanner.gcashPaymentProof || '');
    setDraftBanner(null);
    setDirty(true);
    showToast?.('Draft restored.', 'success');
  }

  function dismissDraft() {
    clearLogSaleDraft();
    setDraftBanner(null);
  }

  function updateLineQuantity(index, next, stock) {
    const capped = Math.min(Math.max(Number(next) || 1, 1), Math.max(stock, 1));
    if (Number(next) > stock) {
      showToast?.(`Quantity capped at available stock (${stock}).`, 'error');
    }
    setLineItems((prev) => prev.map((line, i) => (i === index ? { ...line, quantity: capped } : line)));
    setErrors((prev) => ({ ...prev, items: undefined }));
    markDirty();
  }

  function requestRemoveLine(index) {
    const removed = lineItems[index];
    if (!removed) return;
    if (lineItems.length <= 1) {
      // Keep one empty slot so the form stays valid; still let SA clear a wrong product.
      setLineItems([EMPTY_LINE()]);
      setUndoLine({ line: removed, index: 0, clearedOnly: true });
    } else {
      setLineItems((prev) => prev.filter((_, i) => i !== index));
      setUndoLine({ line: removed, index });
    }
    markDirty();
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndoLine(null), 10000);
    showToast?.('Line removed. Undo available for 10 seconds.', 'success');
  }

  function undoRemoveLine() {
    if (!undoLine) return;
    if (undoLine.clearedOnly) {
      setLineItems([undoLine.line]);
    } else {
      setLineItems((prev) => {
        const next = [...prev];
        next.splice(undoLine.index, 0, undoLine.line);
        return next;
      });
    }
    setUndoLine(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
  }

  function pickProduct(product) {
    setLineItems((prev) => {
      const emptyIdx = prev.findIndex((l) => !l.productId);
      if (emptyIdx >= 0) {
        return prev.map((line, i) => (
          i === emptyIdx
            ? { ...line, productId: String(product.product_id), quantity: 1 }
            : line
        ));
      }
      return [...prev, { productId: String(product.product_id), quantity: 1, _key: createIdempotencyKey() }];
    });
    setPickerOpen(false);
    setErrors((prev) => ({ ...prev, items: undefined }));
    markDirty();
  }

  const buildValidation = () => {
    const nextErrors = {};
    if (!form.customerId) nextErrors.customerId = 'Select a customer.';
    const customerStatus = String(customerDetail?.status || selectedCustomer?.status || 'Active');
    if (form.customerId && customerStatus === 'Pending Identity Review') {
      nextErrors.customerId = 'This customer is Pending Identity Review. Wait for Branch Manager approval before logging a sale.';
    } else if (form.customerId && customerStatus === 'Rejected') {
      nextErrors.customerId = 'This registration was declined (Rejected). Fix & resubmit for Branch Manager review before logging a sale.';
    } else if (form.customerId && customerStatus !== 'Active') {
      nextErrors.customerId = 'Only Active customers can be used for Log a Sale.';
    }
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
      if (selectedMethodName === 'gcash') {
        if (!branchPaymentSettings?.configured && !branchPaymentLoading) {
          nextErrors.gcashReference = 'Branch GCash QR is not configured yet.';
        }
        const ref = String(gcashReference || '').trim();
        if (!ref || ref.length < 6) {
          nextErrors.gcashReference = 'Enter the GCash reference (at least 6 characters).';
        }
      }
    } else {
      const months = Number(pricing?.termMonths || form.termMonths);
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
      if (!form.paymentMethodId) {
        nextErrors.paymentMethodId = 'Select a payment method.';
      }
      const offline = !isBrowserOnline();
      if (!customerDetail?.creditInfo || creditLimit <= 0) {
        nextErrors.payType = offline
          ? 'Offline installment needs a cached approved credit limit. Use cash until credit is approved.'
          : 'Request a Credit Review / wait for Branch Manager to set a credit limit before installment.';
      } else if (creditLimitExceeded) {
        nextErrors.payType = offline
          ? 'Offline remaining credit (limit − outstanding − queued installment sales) is insufficient.'
          : 'Projected outstanding exceeds this customer’s credit limit. Request a Credit Review if needed.';
      } else if (
        !offline
        && creditContext?.pending_review
        && (creditContext.pending_review.risk_level === 'High' || creditContext?.risk?.level === 'High')
      ) {
        nextErrors.payType = 'A high-risk Credit Review is pending Branch Manager decision.';
      } else if (offline && creditContext?.pending_review && creditLimit <= 0) {
        nextErrors.payType = 'Pending credit investigation is cash-only while offline.';
      }
    }

    if (form.payType === 'installment' && (!pricing || !pricingMatchesTotal)) {
      nextErrors.payType = 'Wait for the server pricing calculation before submitting.';
    }

    return { nextErrors, items };
  };

  const buildPayload = (items) => ({
    customer_id: Number(form.customerId),
    payment_method_id: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
    invoices_date: today,
    due_date: form.payType === 'installment' ? form.firstDueDate : undefined,
    notes,
    items,
    customer_name: selectedCustomer || customerDetail
      ? `${(selectedCustomer || customerDetail).first_name || ''} ${(selectedCustomer || customerDetail).last_name || ''}`.trim() || 'Sale'
      : 'Sale',
    pay_type: form.payType,
    down_payment: form.payType === 'installment' ? money(form.downPayment) : 0,
    term_months: form.payType === 'installment' ? Number(pricing?.termMonths || form.termMonths) : undefined,
    monthly_amount: form.payType === 'installment' ? (pricing?.monthlyAmount || installment.monthly) : undefined,
    first_due_date: form.payType === 'installment' ? form.firstDueDate : undefined,
    gcash_reference: form.payType === 'full' && selectedMethodName === 'gcash'
      ? String(gcashReference || '').trim()
      : undefined,
    gcash_payment_proof: form.payType === 'full' && selectedMethodName === 'gcash' && gcashPaymentProof
      ? gcashPaymentProof
      : undefined,
    client_request_id: idempotencyRef.current,
  });

  const keepLocal = async (payload) => {
    if (!isSalesOfflineEnabled()) {
      showToast('Turn on offline mode in Settings to keep this sale on the device.', 'error');
      return false;
    }
    await saveOfflineRecord({
      tableName: 'sales_invoices',
      payload: {
        ...payload,
        total_amount: money(totalAmount),
        saved_offline: true,
      },
    });
    showToast(
      isSalesAutoSyncEnabled()
        ? 'Saved on this device. It will sync when you are online.'
        : 'Saved on this device. Send it from Settings while auto-sync is off.',
      'success'
    );
    setDeviceSales(await loadWaiting('sales_invoices'));
    clearLogSaleDraft();
    setDirty(false);
    return true;
  };

  const validation = buildValidation();
  const canSubmit = Object.keys(validation.nextErrors).length === 0 && !creditLimitExceeded && !submitting;
  const submitBlockedReason = creditLimitExceeded
    ? `Exceeds credit limit by ${formatCurrency(creditEval.overBy)}`
    : (Object.keys(errors).length ? 'Fix highlighted fields before submitting.' : null);

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
    if (submitting) return;
    const { nextErrors, items } = buildValidation();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setConfirmOpen(false);
      showToast('Please fix the errors before submitting.', 'error');
      return;
    }

    // Re-check stock at submit time from latest product list
    for (const item of items) {
      const product = products.find((p) => Number(p.product_id) === item.product_id);
      const stock = Number(product?.available_stock ?? product?.quantity ?? 0);
      if (!product || item.quantity > stock) {
        setConfirmOpen(false);
        showToast(
          product
            ? `Stock changed for ${product.product_name}. Available: ${stock}.`
            : 'A product is no longer available. Refresh and try again.',
          'error'
        );
        return;
      }
    }

    const payload = buildPayload(items);
    setSubmitting(true);

    if (!isBrowserOnline()) {
      setConfirmOpen(false);
      await keepLocal(payload);
      setSubmitting(false);
      return;
    }

    const result = await createSalesInvoice(payload);
    if (!result.success || !result.data) {
      setSubmitting(false);
      if (result.offline) {
        setConfirmOpen(false);
        await keepLocal(payload);
        return;
      }
      showToast(result.message || 'Failed to log sale.', 'error');
      return;
    }

    setConfirmOpen(false);
    setSubmitting(false);
    clearLogSaleDraft();
    setDirty(false);
    setSuccessInvoice(result.data);
    showToast(result.message || 'Sale logged successfully.', 'success');
    idempotencyRef.current = createIdempotencyKey();
  };

  const handleCancel = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    navigateAway();
  };

  function navigateAway() {
    clearLogSaleDraft();
    setDirty(false);
    if (customerId || form.customerId) {
      navigate(`/sales/customer-detail/${customerId || form.customerId}`);
      return;
    }
    navigate('/sales/dashboard');
  }

  function resetForAnotherSale() {
    setSuccessInvoice(null);
    setLineItems([EMPTY_LINE()]);
    setNotes('');
    setGcashReference('');
    setGcashPaymentProof('');
    setErrors({});
    setPricing(null);
    setForm((prev) => ({
      ...prev,
      paymentMethodId: '',
      dueDate: '',
      downPayment: '0',
      firstDueDate: addCalendarMonths(today, 1),
    }));
    idempotencyRef.current = createIdempotencyKey();
    setDirty(false);
  }

  if (loading) return <LoadingState message="Loading log a sale form..." />;

  if (successInvoice) {
    const settlement = successInvoice.spot_cash_settlement;
    const settlementLine = settlement === 'gcash_recorded'
      ? 'Payment recorded (GCash). Invoice still awaits Branch Head document review.'
      : settlement === 'awaiting_pickup'
        ? 'Awaiting same-day collector cash pickup. Invoice still awaits Branch Head document review.'
        : 'Invoice was created and sent for Branch Head review.';
    return (
      <div className="page">
        <section className="panel content-panel log-sale-success">
          <h3>Sale submitted</h3>
          <p className="muted">
            Invoice <strong>{successInvoice.invoice_number}</strong> — {settlementLine}
          </p>
          {successInvoice.spot_cash_payment?.receipt_number ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Receipt <strong>{successInvoice.spot_cash_payment.receipt_number}</strong>
              {successInvoice.spot_cash_payment.reference_number
                ? ` · Ref ${successInvoice.spot_cash_payment.reference_number}`
                : ''}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2" style={{ marginTop: 16 }}>
            <button
              className="button"
              type="button"
              onClick={() => navigate(`/sales/invoices/${encodeURIComponent(successInvoice.invoice_number)}`)}
            >
              View invoice
            </button>
            <button className="button secondary" type="button" onClick={resetForAnotherSale}>
              Log another sale
            </button>
          </div>
        </section>
      </div>
    );
  }

  const summaryProps = {
    customer: selectedCustomer || customerDetail,
    itemCount,
    invoiceTotal: totalAmount,
    payType: form.payType,
    pricing,
    creditEval,
    creditLimit,
    canSubmit,
    submitting,
    submitBlockedReason: creditLimitExceeded ? submitBlockedReason : (Object.keys(errors).length ? submitBlockedReason : null),
    onSubmit: handleSubmitClick,
    onCancel: handleCancel,
  };

  return (
    <div className="page">
      <DeviceQueue rows={deviceSales} />

      {draftBanner ? (
        <div className="log-sale-draft-banner" role="status">
          <span>
            Resume draft from {draftBanner.savedAt
              ? new Date(draftBanner.savedAt).toLocaleString()
              : 'earlier'}?
          </span>
          <div className="flex gap-2">
            <button className="button" type="button" onClick={resumeDraft}>Resume draft</button>
            <button className="button ghost" type="button" onClick={dismissDraft}>Discard draft</button>
          </div>
        </div>
      ) : null}

      {undoLine ? (
        <div className="log-sale-undo-bar" role="status">
          <span>Line item removed.</span>
          <button className="button secondary" type="button" onClick={undoRemoveLine}>Undo</button>
        </div>
      ) : null}

      <div className="log-sale-layout">
        <div className="log-sale-main">
          <CustomerCard
            formCustomerId={form.customerId}
            selectedCustomer={selectedCustomer}
            customerDetail={customerDetail}
            creditContext={creditContext}
            creditEval={creditEval}
            locked={Boolean(customerId)}
            error={errors.customerId}
            onSelect={(customer) => {
              setSelectedCustomer(customer);
              setForm((prev) => ({ ...prev, customerId: String(customer.customer_id) }));
              setErrors((prev) => ({ ...prev, customerId: undefined }));
              markDirty();
            }}
            onClear={() => {
              setSelectedCustomer(null);
              setCustomerDetail(null);
              setForm((prev) => ({ ...prev, customerId: '' }));
              markDirty();
            }}
            onAddNew={() => {
              saveLogSaleDraft({
                form,
                lineItems: lineItems.map(({ productId, quantity }) => ({ productId, quantity })),
                notes,
                gcashReference,
                gcashPaymentProof,
              });
              setFindModalOpen(true);
            }}
            onViewDetails={() => setDetailsOpen(true)}
          />

          <LineItemsTable
            lineItems={lineItems}
            products={products}
            error={errors.items}
            invoiceTotal={totalAmount}
            onAddClick={() => setPickerOpen(true)}
            onQuantityChange={updateLineQuantity}
            onRequestRemove={requestRemoveLine}
          />

          <PaymentSection
            payType={form.payType}
            paymentMethodId={form.paymentMethodId}
            paymentMethods={fullPaymentMethods}
            invoicesDate={form.invoicesDate}
            firstDueDate={form.firstDueDate}
            pricing={pricing}
            errors={errors}
            creditLimitExceeded={creditLimitExceeded}
            overBy={creditEval.overBy}
            branchPaymentSettings={branchPaymentSettings}
            branchPaymentLoading={branchPaymentLoading}
            gcashReference={gcashReference}
            gcashPaymentProof={gcashPaymentProof}
            onGcashReferenceChange={(value) => {
              setGcashReference(value);
              setErrors((prev) => ({ ...prev, gcashReference: undefined }));
              markDirty();
            }}
            onGcashPaymentProofChange={(value, proofErr) => {
              setGcashPaymentProof(value || '');
              setErrors((prev) => ({
                ...prev,
                gcashPaymentProof: proofErr || undefined,
              }));
              markDirty();
            }}
            onPayTypeChange={(payType) => {
              setForm((prev) => ({
                ...prev,
                payType,
                paymentMethodId: '',
                dueDate: '',
                firstDueDate: prev.firstDueDate || addCalendarMonths(prev.invoicesDate || today, 1),
              }));
              setGcashReference('');
              setGcashPaymentProof('');
              setErrors((prev) => ({
                ...prev,
                payType: undefined,
                paymentMethodId: undefined,
                gcashReference: undefined,
                gcashPaymentProof: undefined,
              }));
              markDirty();
            }}
            onPaymentMethodChange={(paymentMethodId) => {
              setForm((prev) => ({ ...prev, paymentMethodId }));
              setErrors((prev) => ({
                ...prev,
                paymentMethodId: undefined,
                gcashReference: undefined,
                gcashPaymentProof: undefined,
              }));
              markDirty();
            }}
            onFirstDueDateChange={(firstDueDate) => {
              setForm((prev) => ({ ...prev, firstDueDate }));
              markDirty();
            }}
            onOpenSchedule={() => setScheduleOpen(true)}
            onOpenSettlement={() => setSettlementOpen(true)}
            onRequestCreditReview={() => {
              if (creditContext?.pending_review?.ci_id) {
                navigate(`/sales/credit-investigations/${creditContext.pending_review.ci_id}`);
                return;
              }
              setCreditReviewOpen(true);
            }}
          />

          <section className="panel content-panel log-sale-step" aria-labelledby="log-sale-step-review">
            <div className="log-sale-step-header">
              <span className="log-sale-step-num" aria-hidden="true">4</span>
              <div>
                <h3 id="log-sale-step-review">Review</h3>
                <p className="muted" style={{ margin: 0 }}>Notes and final check before submit.</p>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="log-sale-notes">Notes</label>
              <textarea
                id="log-sale-notes"
                placeholder="Delivery notes or extra terms…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  markDirty();
                }}
              />
            </div>
            {form.payType === 'full' && pricing ? (
              <div className="log-sale-review-cash muted">
                Amount due: <strong>{formatCurrency(pricing.finalObligation)}</strong>
                {' · '}
                {selectedMethodName === 'gcash'
                  ? `GCash ref will be recorded on submit${gcashReference.trim() ? ` (${gcashReference.trim()})` : ''}`
                  : selectedMethodName === 'cash'
                    ? 'Cash — awaiting same-day collector pickup after submit'
                    : 'Status: Pending payment'}
              </div>
            ) : null}
          </section>
        </div>

        <div className="log-sale-aside">
          <SaleSummaryCard {...summaryProps} />
        </div>
      </div>

      <div className="log-sale-mobile-summary">
        <SaleSummaryCard {...summaryProps} stickyMobile />
      </div>

      <CustomerDetailsModal
        open={detailsOpen}
        customerDetail={customerDetail}
        creditContext={creditContext}
        creditEval={creditEval}
        onClose={() => setDetailsOpen(false)}
      />

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        excludeIds={lineItems.map((l) => l.productId).filter(Boolean)}
        onClose={() => setPickerOpen(false)}
        onPick={pickProduct}
      />

      <ScheduleModal
        open={scheduleOpen}
        schedule={pricing?.schedule}
        onClose={() => setScheduleOpen(false)}
      />

      <EarlySettlementModal
        open={settlementOpen}
        options={pricing?.settlementOptions}
        onClose={() => setSettlementOpen(false)}
      />

      <ConfirmSubmitModal
        open={confirmOpen}
        customer={selectedCustomer || customerDetail}
        itemCount={itemCount}
        invoiceTotal={totalAmount}
        payType={form.payType}
        pricing={pricing}
        busy={submitting}
        onCancel={() => !submitting && setConfirmOpen(false)}
        onConfirm={handleConfirmedSubmit}
      />

      <ConfirmModal
        open={discardOpen}
        title="Discard this sale?"
        description="Unsaved changes will be lost. A local draft may still be available next time."
        confirmLabel="Discard"
        confirmTone="danger"
        cancelLabel="Keep editing"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          setDiscardOpen(false);
          navigateAway();
        }}
      />

      <CreditReviewRequestModal
        open={creditReviewOpen}
        customer={customerDetail}
        isFirstCredit={
          !customerDetail?.creditInfo
          || money(customerDetail?.creditInfo?.credit_limit || 0) <= 0
        }
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

      <FindExistingCustomerModal
        open={findModalOpen}
        onClose={() => setFindModalOpen(false)}
        navigate={navigate}
        showToast={showToast}
        registerPath={`/sales/customers/new?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      />

      {customerDetailLoading ? (
        <span className="sr-only">Loading customer details…</span>
      ) : null}
    </div>
  );
}
