import { openDB, type DBSchema } from 'idb';
import type { InspectionAnswer, InspectionNote, InspectionPhoto, PropertyCost, PropertyRecord } from './types';
interface RentDB extends DBSchema {
  properties: { key: string; value: PropertyRecord; indexes: { 'by-updated': string } };
  answers: { key: string; value: InspectionAnswer; indexes: { 'by-property': string } };
  costs: { key: string; value: PropertyCost; indexes: { 'by-property': string } };
  notes: { key: string; value: InspectionNote; indexes: { 'by-property': string } };
  photos: { key: string; value: InspectionPhoto; indexes: { 'by-property': string } };
}
const DB_NAME = 'before-you-rent';
export const dbPromise = openDB<RentDB>(DB_NAME, 2, {
  upgrade(db) {
    const properties = db.createObjectStore('properties', { keyPath: 'id' }); properties.createIndex('by-updated', 'updatedAt');
    const answers = db.createObjectStore('answers', { keyPath: ['propertyId', 'itemId'] }); answers.createIndex('by-property', 'propertyId');
    const costs = db.createObjectStore('costs', { keyPath: 'id' }); costs.createIndex('by-property', 'propertyId');
    const notes = db.objectStoreNames.contains('notes') ? undefined : db.createObjectStore('notes', { keyPath: 'id' }); notes?.createIndex('by-property', 'propertyId');
    const photos = db.objectStoreNames.contains('photos') ? undefined : db.createObjectStore('photos', { keyPath: 'id' }); photos?.createIndex('by-property', 'propertyId');
  },
});
export async function getProperties() { return (await dbPromise).getAllFromIndex('properties', 'by-updated'); }
export async function deleteAllData() {
  const db = await dbPromise;
  const tx = db.transaction(['properties', 'answers', 'costs', 'notes', 'photos'], 'readwrite');
  tx.objectStore('properties').clear(); tx.objectStore('answers').clear(); tx.objectStore('costs').clear(); tx.objectStore('notes').clear(); tx.objectStore('photos').clear();
  await tx.done;
}
export async function saveProperty(value: PropertyRecord) { return (await dbPromise).put('properties', value); }
export async function deleteProperty(id: string) {
  const db = await dbPromise; const tx = db.transaction(['properties','answers','costs','notes','photos'], 'readwrite');
  await Promise.all([tx.objectStore('properties').delete(id), tx.objectStore('answers').index('by-property').openCursor(IDBKeyRange.only(id)).then(async cursor => { while(cursor) { await cursor.delete(); cursor = await cursor.continue(); } }), tx.objectStore('costs').index('by-property').openCursor(IDBKeyRange.only(id)).then(async cursor => { while(cursor) { await cursor.delete(); cursor = await cursor.continue(); } }), tx.objectStore('notes').index('by-property').openCursor(IDBKeyRange.only(id)).then(async cursor => { while(cursor) { await cursor.delete(); cursor = await cursor.continue(); } }), tx.objectStore('photos').index('by-property').openCursor(IDBKeyRange.only(id)).then(async cursor => { while(cursor) { await cursor.delete(); cursor = await cursor.continue(); } })]);
  await tx.done;
}
export async function getAnswers(id: string) { return (await dbPromise).getAllFromIndex('answers','by-property',id); }
export async function saveAnswer(value: InspectionAnswer) { return (await dbPromise).put('answers', value); }
export async function getCosts(id: string) { return (await dbPromise).getAllFromIndex('costs','by-property',id); }
export async function saveCost(value: PropertyCost) { return (await dbPromise).put('costs', value); }
export async function removeCost(id: string) { return (await dbPromise).delete('costs', id); }
export async function getNotes(id: string) { return (await dbPromise).getAllFromIndex('notes','by-property',id); }
export async function saveNote(value: InspectionNote) { return (await dbPromise).put('notes', value); }
export async function removeNote(id: string) { return (await dbPromise).delete('notes', id); }

export async function getPhotos(id: string) { return (await dbPromise).getAllFromIndex('photos','by-property',id); }
export async function savePhoto(value: InspectionPhoto) { return (await dbPromise).put('photos', value); }
export async function removePhoto(id: string) { return (await dbPromise).delete('photos', id); }

export async function importBackupData(
  properties: PropertyRecord[],
  details: Array<{ id: string; answers: InspectionAnswer[]; costs: PropertyCost[]; notes: InspectionNote[]; photos: InspectionPhoto[] }>,
) {
  const db = await dbPromise;
  const tx = db.transaction(['properties', 'answers', 'costs', 'notes', 'photos'], 'readwrite');
  try {
    const writes: Promise<unknown>[] = [];
    for (const property of properties) writes.push(tx.objectStore('properties').put(property));
    for (const detail of details) {
      for (const answer of detail.answers) writes.push(tx.objectStore('answers').put(answer));
      for (const cost of detail.costs) writes.push(tx.objectStore('costs').put(cost));
      for (const note of detail.notes) writes.push(tx.objectStore('notes').put(note));
      for (const photo of detail.photos) writes.push(tx.objectStore('photos').put(photo));
    }
    await Promise.all([...writes, tx.done]);
  } catch (error) {
    try { tx.abort(); } catch { /* The transaction may already have aborted. */ }
    throw error;
  }
}
