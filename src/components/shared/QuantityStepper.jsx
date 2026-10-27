/**
 * Compact (−) value (+) control for quantity fields.
 * Calls onChange with a string value so existing form handlers keep working.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  disabled = false,
  id,
  name,
  className = '',
  inputClassName = 'filter-input',
  'aria-label': ariaLabel = 'Quantity',
}) {
  const minNum = Number.isFinite(Number(min)) ? Number(min) : undefined;
  const maxNum = max !== undefined && max !== null && max !== '' && Number.isFinite(Number(max))
    ? Number(max)
    : undefined;
  const stepNum = Number(step) > 0 ? Number(step) : 1;
  const parsed = value === '' || value === null || value === undefined ? NaN : Number(value);
  const current = Number.isFinite(parsed) ? parsed : (minNum ?? 0);

  const clamp = (n) => {
    let next = n;
    if (minNum !== undefined) next = Math.max(minNum, next);
    if (maxNum !== undefined) next = Math.min(maxNum, next);
    return next;
  };

  const emit = (n) => {
    if (typeof onChange === 'function') onChange(String(clamp(n)));
  };

  const atMin = minNum !== undefined && Number.isFinite(parsed) && parsed <= minNum;
  const atMax = maxNum !== undefined && Number.isFinite(parsed) && parsed >= maxNum;

  return (
    <div className={`quantity-stepper${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="quantity-stepper__btn"
        onClick={() => emit(current - stepNum)}
        disabled={disabled || atMin}
        aria-label={`Decrease ${ariaLabel}`}
        tabIndex={-1}
      >
        −
      </button>
      <input
        id={id}
        name={name}
        className={`quantity-stepper__input${inputClassName ? ` ${inputClassName}` : ''}`}
        type="number"
        inputMode="numeric"
        min={minNum}
        max={maxNum}
        step={stepNum}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange?.(raw);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            onChange?.(raw);
            return;
          }
          emit(n);
        }}
      />
      <button
        type="button"
        className="quantity-stepper__btn"
        onClick={() => emit(current + stepNum)}
        disabled={disabled || atMax}
        aria-label={`Increase ${ariaLabel}`}
        tabIndex={-1}
      >
        +
      </button>
    </div>
  );
}
