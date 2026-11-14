/** ₹1,782 or ₹50.50: Indian grouping, paise only when there are any. */
export function formatRupees(value) {
  const amount = Number(value) || 0;
  const hasPaise = Math.abs(amount - Math.round(amount)) > 0.004;
  return `₹${amount.toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Amount without the ₹ sign, for strings that already carry it. */
export function plainAmount(value) {
  return formatRupees(value).slice(1);
}

/** 2 × ₹280 for a line, from its quantity and line total. */
export function lineDetail(item) {
  const quantity = Number(item.quantity) || 1;
  const shownQuantity = Number.isInteger(quantity) ? quantity : quantity.toFixed(2);
  return `${shownQuantity} × ${formatRupees(Number(item.amount) / quantity)}`;
}

/** The bill's language for strings: Malayalam when the server replied in it. */
export function billLanguage(bill, fallback = 'en') {
  if (bill?.language_code === 'ml-IN') return 'ml';
  if (bill?.language_code === 'en-IN') return 'en';
  return fallback;
}
