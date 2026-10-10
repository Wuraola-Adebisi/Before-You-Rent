import test from 'node:test';
import assert from 'node:assert/strict';
import { rentMonthlyEquivalent, rentPeriodMonths, rentPeriodLabel, summarizeCosts } from '../src/finance.ts';
import { validateBackupPayload } from '../src/backup.ts';

const property = (overrides = {}) => ({
  id: 'p1', name: 'Flat A', address: 'Yaba, Lagos', propertyType: 'Flat', bedrooms: 1,
  rentAmount: 1800000, rentDuration: 'year', inspectionDate: '2026-10-10',
  createdAt: '2026-10-10T10:00:00.000Z', updatedAt: '2026-10-10T10:00:00.000Z', notes: '',
  ...overrides,
});
const backup = () => ({ schemaVersion: 1, exportedAt: '2026-10-10T10:00:00.000Z', properties: [property()], details: [{ id: 'p1', answers: [], costs: [], notes: [], photos: [] }] });

test('rent durations normalise to months consistently', () => {
  assert.equal(rentPeriodMonths('month'), 1);
  assert.equal(rentPeriodMonths('quarter'), 3);
  assert.equal(rentPeriodMonths('half_year'), 6);
  assert.equal(rentPeriodMonths('year'), 12);
  assert.equal(rentMonthlyEquivalent(300000, 'quarter'), 100000);
  assert.equal(rentMonthlyEquivalent(600000, 'half_year'), 100000);
  assert.equal(rentMonthlyEquivalent(1200000, 'year'), 100000);
  assert.equal(rentMonthlyEquivalent(100000, 'month'), 100000);
  assert.equal(rentPeriodLabel('quarter'), 'every 3 months');
  assert.equal(rentMonthlyEquivalent(600000, 'custom', 2), 300000);
  assert.equal(rentPeriodLabel('custom', 2), 'every 2 months');
});
test('invalid rent amounts never produce invalid monthly totals', () => {
  assert.equal(rentMonthlyEquivalent(Number.NaN, 'year'), 0);
  assert.equal(rentMonthlyEquivalent(-50, 'month'), 0);
});
test('upfront deposits count toward cash due, not recurring monthly costs', () => {
  const summary = summarizeCosts(property(), [
    { id:'c1', propertyId:'p1', label:'Caution deposit', amount:150000, kind:'upfront', refundable:true, frequency:'once', note:'' },
    { id:'c2', propertyId:'p1', label:'Agency fee', amount:100000, kind:'upfront', refundable:false, frequency:'once', note:'' },
    { id:'c3', propertyId:'p1', label:'Service charge', amount:120000, kind:'recurring', refundable:false, frequency:'yearly', note:'' },
    { id:'c4', propertyId:'p1', label:'Waste', amount:5000, kind:'recurring', refundable:false, frequency:'monthly', note:'' },
  ]);
  assert.equal(summary.rentMonthly, 150000);
  assert.equal(summary.refundableUpfront, 150000);
  assert.equal(summary.nonRefundableUpfront, 100000);
  assert.equal(summary.upfrontTotal, 250000);
  assert.equal(summary.cashDueAtStart, 2050000);
  assert.equal(summary.recurringMonthly, 15000);
  assert.equal(summary.monthlyEquivalentTotal, 165000);
});
test('backup validator accepts multiple valid properties with separate details', () => {
  const payload = backup();
  payload.properties.push(property({ id:'p2', name:'Flat B', rentDuration:'quarter', rentAmount:450000 }));
  payload.details.push({ id:'p2', answers:[], costs:[], notes:[], photos:[] });
  assert.equal(validateBackupPayload(payload), null);
});
test('backup validator rejects missing fields, invalid durations and duplicate IDs', () => {
  assert.match(validateBackupPayload({ ...backup(), properties:[property({ address:'' })] }), /name or address/);
  assert.match(validateBackupPayload({ ...backup(), properties:[property({ rentDuration:'weekly' })] }), /rent period or date/);
  const payload=backup(); payload.properties.push(property({ name:'Duplicate ID' }));
  assert.match(validateBackupPayload(payload), /unique, valid ID/);
});
test('backup validator rejects cross-property records and malformed photo payloads', () => {
  const payload=backup();
  payload.details[0].notes.push({ id:'n1', propertyId:'another-property', question:'Who fixes this?', answer:'', resolved:false, createdAt:'2026-10-10T10:00:00.000Z' });
  assert.match(validateBackupPayload(payload), /follow-up question is invalid/);
  const withPhoto=backup();
  withPhoto.details[0].photos.push({ id:'ph1', propertyId:'p1', name:'proof.jpg', mimeType:'image/jpeg', caption:'', createdAt:'2026-10-10T10:00:00.000Z', blob:'data:text/html;base64,abc' });
  assert.match(validateBackupPayload(withPhoto), /photo in the backup is invalid/);
});
