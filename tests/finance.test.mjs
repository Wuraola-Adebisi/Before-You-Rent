import test from 'node:test';
import assert from 'node:assert/strict';
import { rentMonthlyEquivalent, rentPeriodMonths, rentPeriodLabel, summarizeCosts } from '../src/finance.ts';
import { validateBackupPayload } from '../src/backup.ts';
import 'fake-indexeddb/auto';
const database = await import('../src/db.ts');

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


test('property updates retain stable IDs and keep checklist, costs, notes, and photos linked', async () => {
  await database.deleteAllData();
  const p = property();
  await database.saveProperty(p);
  await database.saveAnswer({ propertyId:'p1', itemId:'water-flow', status:'concern', note:'Low pressure', updatedAt:'2026-10-10T10:00:00.000Z' });
  await database.saveCost({ id:'c1', propertyId:'p1', label:'Caution', amount:100000, kind:'upfront', refundable:true, frequency:'once', note:'' });
  await database.saveNote({ id:'n1', propertyId:'p1', question:'Who fixes the pump?', answer:'Landlord', resolved:false, createdAt:'2026-10-10T10:00:00.000Z' });
  await database.savePhoto({ id:'ph1', propertyId:'p1', name:'pump.jpg', mimeType:'image/jpeg', blob:new Blob(['photo'], {type:'image/jpeg'}), caption:'Pump', createdAt:'2026-10-10T10:00:00.000Z', includeInReport:true });
  await database.saveProperty({ ...p, address:'Updated address, Lagos', rentAmount:2100000, updatedAt:'2026-10-11T10:00:00.000Z' });
  assert.equal((await database.getProperties())[0].id, 'p1');
  assert.equal((await database.getProperties())[0].address, 'Updated address, Lagos');
  assert.equal((await database.getAnswers('p1'))[0].status, 'concern');
  assert.equal((await database.getCosts('p1'))[0].amount, 100000);
  assert.equal((await database.getNotes('p1'))[0].question, 'Who fixes the pump?');
  assert.equal((await database.getPhotos('p1'))[0].includeInReport, true);
});
test('checklist answers update in place instead of creating duplicates', async () => {
  await database.deleteAllData();
  const first = { propertyId:'p1', itemId:'water-flow', status:'concern', note:'Low pressure', updatedAt:'2026-10-10T10:00:00.000Z' };
  await database.saveAnswer(first);
  await database.saveAnswer({ ...first, status:'okay', updatedAt:'2026-10-10T11:00:00.000Z' });
  const answers = await database.getAnswers('p1');
  assert.equal(answers.length, 1);
  assert.equal(answers[0].status, 'okay');
  assert.equal(answers[0].note, 'Low pressure');
});
test('backup restoration merges multiple properties and restores photo blobs', async () => {
  await database.deleteAllData();
  const unrelated = property({ id:'existing', name:'Keep this property' });
  await database.saveProperty(unrelated);
  const p1 = property();
  const p2 = property({ id:'p2', name:'Flat B', rentDuration:'custom', rentPeriodMonths:2, rentAmount:400000 });
  const photo = { id:'ph1', propertyId:'p2', name:'meter.jpg', mimeType:'image/jpeg', blob:new Blob(['meter evidence'], {type:'image/jpeg'}), caption:'Meter', createdAt:'2026-10-10T10:00:00.000Z', includeInReport:false };
  await database.importBackupData([p1,p2], [
    { id:'p1', answers:[{propertyId:'p1',itemId:'water-flow',status:'okay',note:'Tap tested',updatedAt:'2026-10-10T10:00:00.000Z'}], costs:[], notes:[], photos:[] },
    { id:'p2', answers:[], costs:[{id:'c2',propertyId:'p2',label:'Agency',amount:80000,kind:'upfront',refundable:false,frequency:'once',note:''}], notes:[], photos:[photo] },
  ]);
  assert.deepEqual((await database.getProperties()).map(p=>p.id).sort(), ['existing','p1','p2']);
  assert.equal((await database.getAnswers('p1'))[0].note, 'Tap tested');
  assert.equal((await database.getCosts('p2'))[0].amount, 80000);
  const restoredPhoto = (await database.getPhotos('p2'))[0];
  assert.equal(restoredPhoto.includeInReport, false);
  assert.equal(await restoredPhoto.blob.text(), 'meter evidence');
});
test('failed multi-record import rolls back the whole IndexedDB transaction', async () => {
  await database.deleteAllData();
  await assert.rejects(database.importBackupData([property(), {}], []));
  assert.equal((await database.getProperties()).length, 0);
});
test('deleting a property removes its related records and delete-all clears every store', async () => {
  await database.deleteAllData();
  await database.saveProperty(property());
  await database.saveProperty(property({ id:'p2', name:'Flat B' }));
  await database.saveAnswer({propertyId:'p1',itemId:'water-flow',status:'concern',note:'',updatedAt:'2026-10-10T10:00:00.000Z'});
  await database.saveCost({id:'c1',propertyId:'p1',label:'Fee',amount:10000,kind:'upfront',refundable:false,frequency:'once',note:''});
  await database.saveNote({id:'n1',propertyId:'p1',question:'Who fixes this?',answer:'',resolved:false,createdAt:'2026-10-10T10:00:00.000Z'});
  await database.savePhoto({id:'ph1',propertyId:'p1',name:'issue.jpg',mimeType:'image/jpeg',blob:new Blob(['x'],{type:'image/jpeg'}),caption:'',createdAt:'2026-10-10T10:00:00.000Z'});
  await database.deleteProperty('p1');
  assert.deepEqual((await database.getProperties()).map(p=>p.id), ['p2']);
  assert.equal((await database.getAnswers('p1')).length, 0);
  assert.equal((await database.getCosts('p1')).length, 0);
  assert.equal((await database.getNotes('p1')).length, 0);
  assert.equal((await database.getPhotos('p1')).length, 0);
  await database.deleteAllData();
  assert.equal((await database.getProperties()).length, 0);
});
