import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { DealTerms, Deliverable } from '../types/api';
import '../styles/transaction.css';

interface DealTermsFormProps {
  initialTerms?: DealTerms;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (terms: DealTerms) => Promise<void>;
  error?: string | null;
  disabled?: boolean;
}

interface EditableDeliverable extends Deliverable {
  fieldKey: number;
}

const dateInputValue = (date?: string) => date?.slice(0, 10) ?? '';

/** Convert a decimal amount without floating-point multiplication or rounding. */
function amountInCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000 ? cents : null;
}

/** The same terms editor can be used for creation and a versioned proposal. */
export function DealTermsForm({
  initialTerms,
  submitting,
  submitLabel,
  onSubmit,
  error,
  disabled = false,
}: DealTermsFormProps) {
  const prefix = useId();
  const [title, setTitle] = useState(initialTerms?.title ?? '');
  const [description, setDescription] = useState(initialTerms?.description ?? '');
  const [amount, setAmount] = useState(initialTerms ? (initialTerms.paymentAmount / 100).toFixed(2) : '');
  const [currency, setCurrency] = useState(initialTerms?.currency ?? 'INR');
  const [deliverables, setDeliverables] = useState<EditableDeliverable[]>(() =>
    (initialTerms?.deliverables ?? [{ title: '', description: '' }]).map((item, fieldKey) => ({ ...item, fieldKey })),
  );
  const nextKey = useRef(deliverables.length);
  const [startDate, setStartDate] = useState(initialTerms?.timeline?.startDate ?? '');
  const [endDate, setEndDate] = useState(initialTerms?.timeline?.endDate ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const message = validationError ?? error;

  useEffect(() => {
    if (message) errorRef.current?.focus();
  }, [message]);

  const updateDeliverable = (fieldKey: number, field: keyof Deliverable, value: string) => {
    setDeliverables((items) => items.map((item) => item.fieldKey === fieldKey ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || disabled || submitLock.current) return;
    setValidationError(null);
    const paymentAmount = amountInCents(amount);

    if (!title.trim() || !description.trim()) {
      setValidationError('Add a title and description for this deal.');
      return;
    }
    if (paymentAmount === null) {
      setValidationError('Enter a payment amount from 0.01 to 1,000,000.00, with up to two decimal places.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setValidationError('Enter a three-letter currency code, such as INR or USD.');
      return;
    }
    if (!deliverables.length || deliverables.some((item) => !item.title.trim() || !item.description.trim())) {
      setValidationError('Add a title and description for each deliverable.');
      return;
    }
    if (startDate && endDate && dateInputValue(endDate) < dateInputValue(startDate)) {
      setValidationError('The end date must be on or after the start date.');
      return;
    }

    // Keep existing milestones when this editor is used for a terms proposal.
    const timeline = {
      ...(initialTerms?.timeline?.milestones ? { milestones: initialTerms.timeline.milestones } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };
    const terms: DealTerms = {
      title: title.trim(),
      description: description.trim(),
      deliverables: deliverables.map((item) => ({
        title: item.title.trim(),
        description: item.description.trim(),
        ...(item.deadline ? { deadline: item.deadline } : {}),
      })),
      paymentAmount,
      currency,
      ...(Object.keys(timeline).length ? { timeline } : {}),
    };

    submitLock.current = true;
    try {
      await onSubmit(terms);
    } catch {
      setValidationError('The request could not be confirmed. Check the deal before submitting again. Your entries are still here.');
    } finally {
      submitLock.current = false;
    }
  };

  return (
    <form className="transaction-form" onSubmit={handleSubmit} aria-busy={submitting}>
      <fieldset className="transaction-form-section" disabled={submitting || disabled}>
        <legend><span>01</span> The agreement</legend>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-title`}>Deal title</label>
          <input id={`${prefix}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={255} placeholder="e.g. Autumn launch collaboration" autoComplete="off" />
        </div>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-description`}>Description</label>
          <textarea id={`${prefix}-description`} value={description} onChange={(event) => setDescription(event.target.value)} required rows={3} placeholder="Set out the collaboration and what you have agreed." />
        </div>
      </fieldset>

      <fieldset className="transaction-form-section" disabled={submitting || disabled}>
        <legend><span>02</span> The deliverables</legend>
        <p className="transaction-note">Describe each piece of work so your creator knows what is expected.</p>
        {deliverables.map((item, index) => (
          <div className="transaction-deliverable" key={item.fieldKey}>
            <div className="transaction-deliverable-heading">
              <h3>Deliverable {String(index + 1).padStart(2, '0')}</h3>
              {deliverables.length > 1 && (
                <button type="button" className="transaction-link" aria-label={`Remove deliverable ${index + 1}`} onClick={() => setDeliverables((items) => items.filter((entry) => entry.fieldKey !== item.fieldKey))}>Remove</button>
              )}
            </div>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-deliverable-${item.fieldKey}-title`}>Title</label>
              <input id={`${prefix}-deliverable-${item.fieldKey}-title`} value={item.title} onChange={(event) => updateDeliverable(item.fieldKey, 'title', event.target.value)} required maxLength={255} placeholder="e.g. One 30-second product video" />
            </div>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-deliverable-${item.fieldKey}-description`}>Deliverable description</label>
              <textarea id={`${prefix}-deliverable-${item.fieldKey}-description`} value={item.description} onChange={(event) => updateDeliverable(item.fieldKey, 'description', event.target.value)} required rows={2} placeholder="Include format, scope and any agreed requirements." />
            </div>
            <div className="transaction-field transaction-field--date">
              <label htmlFor={`${prefix}-deliverable-${item.fieldKey}-deadline`}>Deadline <span>(optional)</span></label>
              <input type="date" id={`${prefix}-deliverable-${item.fieldKey}-deadline`} value={dateInputValue(item.deadline)} onChange={(event) => updateDeliverable(item.fieldKey, 'deadline', event.target.value)} />
            </div>
          </div>
        ))}
        <button type="button" className="transaction-link transaction-add-deliverable" onClick={() => setDeliverables((items) => [...items, { fieldKey: nextKey.current++, title: '', description: '' }])}>+ Add a deliverable</button>
      </fieldset>

      <fieldset className="transaction-form-section" disabled={submitting || disabled}>
        <legend><span>03</span> Payment &amp; timing</legend>
        <div className="transaction-fields transaction-fields--payment">
          <div className="transaction-field">
            <label htmlFor={`${prefix}-amount`}>Total payment amount</label>
            <input id={`${prefix}-amount`} type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" aria-describedby={`${prefix}-amount-hint`} />
            <span className="transaction-field-hint" id={`${prefix}-amount-hint`}>Enter the full amount, up to 1,000,000.00.</span>
          </div>
          <div className="transaction-field">
            <label htmlFor={`${prefix}-currency`}>Currency</label>
            <input id={`${prefix}-currency`} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required minLength={3} maxLength={3} pattern="[A-Z]{3}" autoCapitalize="characters" spellCheck={false} aria-describedby={`${prefix}-currency-hint`} />
            <span className="transaction-field-hint" id={`${prefix}-currency-hint`}>e.g. INR, USD, GBP</span>
          </div>
        </div>
        <details className="transaction-timeline-editor" open={initialTerms?.timeline ? true : undefined}>
          <summary>Add collaboration dates <span>(optional)</span></summary>
          <div className="transaction-fields">
            <div className="transaction-field">
              <label htmlFor={`${prefix}-start`}>Start date</label>
              <input type="date" id={`${prefix}-start`} value={dateInputValue(startDate)} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-end`}>End date</label>
              <input type="date" id={`${prefix}-end`} value={dateInputValue(endDate)} min={dateInputValue(startDate) || undefined} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
        </details>
      </fieldset>

      {message && <p className="transaction-error" role="alert" ref={errorRef} tabIndex={-1}>{message}</p>}
      <div className="transaction-actions transaction-form-actions">
        <button className="transaction-button transaction-button--primary" type="submit" disabled={submitting || disabled} aria-busy={submitting}>
          {submitting ? 'Saving…' : submitLabel}<span aria-hidden="true"> →</span>
        </button>
      </div>
    </form>
  );
}
