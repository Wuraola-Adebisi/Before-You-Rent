import type { PropertyCost, PropertyRecord } from './types';

const RENT_PERIOD_MONTHS: Record<PropertyRecord['rentDuration'], number> = { month: 1, quarter: 3, half_year: 6, year: 12 };
export function rentPeriodMonths(duration: PropertyRecord['rentDuration']): number { return RENT_PERIOD_MONTHS[duration] ?? 12; }
export function rentPeriodLabel(duration: PropertyRecord['rentDuration']): string {
  const labels: Record<PropertyRecord['rentDuration'], string> = { month: 'per month', quarter: 'every 3 months', half_year: 'every 6 months', year: 'per year' };
  return labels[duration] ?? 'per year';
}
export function rentMonthlyEquivalent(amount: number, duration: PropertyRecord['rentDuration']): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount / rentPeriodMonths(duration);
}
export function summarizeCosts(property: PropertyRecord | null, costs: PropertyCost[]) {
  if (!property) return null;
  const validCosts = costs.filter(cost => Number.isFinite(cost.amount) && cost.amount >= 0);
  const upfront = validCosts.filter(cost => cost.kind === 'upfront');
  const recurring = validCosts.filter(cost => cost.kind === 'recurring');
  const upfrontTotal = upfront.reduce((sum, cost) => sum + cost.amount, 0);
  const refundableUpfront = upfront.filter(cost => cost.refundable).reduce((sum, cost) => sum + cost.amount, 0);
  const nonRefundableUpfront = upfrontTotal - refundableUpfront;
  const recurringMonthly = recurring.reduce((sum, cost) => {
    if (cost.frequency === 'monthly') return sum + cost.amount;
    if (cost.frequency === 'yearly') return sum + cost.amount / 12;
    return sum;
  }, 0);
  const rentMonthly = rentMonthlyEquivalent(property.rentAmount, property.rentDuration);
  const rentDueNow = property.rentAmount;
  return { rentMonthly, rentDueNow, upfrontTotal, refundableUpfront, nonRefundableUpfront, recurringMonthly, cashDueAtStart: rentDueNow + upfrontTotal, monthlyEquivalentTotal: rentMonthly + recurringMonthly };
}
