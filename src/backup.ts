type AnyRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is AnyRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const validDate = (value: unknown) => { if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(value + 'T00:00:00.000Z'); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; };
const validTimestamp = (value: unknown) => isText(value) && !Number.isNaN(Date.parse(value));
const validDuration = (value: unknown) => ['month', 'quarter', 'half_year', 'year', 'custom'].includes(String(value));
const unique = (values: string[]) => new Set(values).size === values.length;

export function validateBackupPayload(value: unknown): string | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.properties) || !Array.isArray(value.details)) return 'This is not a supported Before You Rent backup.';
  const properties = value.properties;
  if (!properties.every(isRecord)) return 'The backup contains an invalid property record.';
  const propertyIds = properties.map(p => p.id);
  if (!propertyIds.every(isText) || !unique(propertyIds as string[])) return 'Every property must have a unique, valid ID.';
  for (const property of properties) {
    if (!isText(property.name) || !property.name.trim() || property.name.length > 90 || !isText(property.address) || !property.address.trim() || property.address.length > 180) return 'A property is missing a valid name or address.';
    if (!isText(property.propertyType) || typeof property.bedrooms !== 'number' || !Number.isInteger(property.bedrooms) || property.bedrooms < 0 || typeof property.rentAmount !== 'number' || !Number.isFinite(property.rentAmount) || property.rentAmount <= 0) return 'A property has an invalid type, bedroom count, or rent amount.';
    if (!validDuration(property.rentDuration) || (property.rentDuration === 'custom' && (typeof property.rentPeriodMonths !== 'number' || !Number.isInteger(property.rentPeriodMonths) || property.rentPeriodMonths < 1 || property.rentPeriodMonths > 120)) || !validDate(property.inspectionDate) || !validTimestamp(property.createdAt) || !validTimestamp(property.updatedAt)) return 'A property has an invalid rent period or date.';
    if (!isText(property.notes)) return 'A property notes field is invalid.';
  }
  if (value.details.length !== properties.length || !value.details.every(isRecord)) return 'The backup is missing property details or contains unexpected detail records.';
  const detailsIds = value.details.map(detail => detail.id);
  if (!detailsIds.every(isText) || !unique(detailsIds as string[]) || (detailsIds as string[]).some(id => !(propertyIds as string[]).includes(id))) return 'The backup contains duplicate or unmatched property details.';
  const seenCosts: string[] = [], seenNotes: string[] = [], seenPhotos: string[] = [];
  for (const detail of value.details) {
    const id = detail.id as string;
    for (const key of ['answers', 'costs', 'notes', 'photos']) if (!Array.isArray(detail[key])) return 'A property detail section is malformed: ' + key + '.';
    const answers = detail.answers as AnyRecord[], costs = detail.costs as AnyRecord[], notes = detail.notes as AnyRecord[], photos = detail.photos as AnyRecord[];
    if (!answers.every(isRecord) || !costs.every(isRecord) || !notes.every(isRecord) || !photos.every(isRecord)) return 'The backup contains a malformed checklist, cost, note, or photo record.';
    const seenAnswerIds: string[] = [];
    for (const answer of answers) {
      if (answer.propertyId !== id || !isText(answer.itemId) || !['okay', 'concern', 'not_checked', 'not_applicable'].includes(String(answer.status)) || !isText(answer.note) || !validTimestamp(answer.updatedAt)) return 'A checklist response is invalid or belongs to another property.';
      seenAnswerIds.push(answer.itemId as string);
    }
    if (!unique(seenAnswerIds)) return 'The backup contains duplicate checklist responses for a property.';
    for (const cost of costs) {
      if (!isText(cost.id) || !isText(cost.label) || !cost.label.trim() || cost.propertyId !== id || typeof cost.amount !== 'number' || !Number.isFinite(cost.amount) || cost.amount <= 0 || !['upfront', 'recurring'].includes(String(cost.kind)) || typeof cost.refundable !== 'boolean' || !['once', 'monthly', 'yearly'].includes(String(cost.frequency)) || !isText(cost.note)) return 'A cost record is invalid or belongs to another property.';
      if ((cost.kind === 'recurring' && cost.frequency === 'once') || (cost.refundable && cost.kind !== 'upfront')) return 'A cost has an inconsistent payment type, frequency, or refundable status.';
      seenCosts.push(cost.id as string);
    }
    for (const note of notes) {
      if (!isText(note.id) || note.propertyId !== id || !isText(note.question) || !note.question.trim() || !isText(note.answer) || typeof note.resolved !== 'boolean' || !validTimestamp(note.createdAt)) return 'A follow-up question is invalid or belongs to another property.';
      seenNotes.push(note.id as string);
    }
    for (const photo of photos) {
      if (!isText(photo.id) || photo.propertyId !== id || !isText(photo.name) || !isText(photo.mimeType) || !photo.mimeType.startsWith('image/') || !isText(photo.caption) || (photo.includeInReport !== undefined && typeof photo.includeInReport !== 'boolean') || !validTimestamp(photo.createdAt) || !isText(photo.blob) || !/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+\/]*={0,2}$/.test(photo.blob)) return 'A photo in the backup is invalid or belongs to another property.';
      seenPhotos.push(photo.id as string);
    }
  }
  if (!unique(seenCosts) || !unique(seenNotes) || !unique(seenPhotos)) return 'The backup contains duplicate cost, question, or photo IDs.';
  return null;
}
