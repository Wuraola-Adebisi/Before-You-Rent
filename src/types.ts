export type CheckStatus = 'okay' | 'concern' | 'not_checked' | 'not_applicable';
export type CostKind = 'upfront' | 'recurring';
export type PropertyRecord = {
  id: string; name: string; address: string; propertyType: string; bedrooms: number;
  rentAmount: number; rentDuration: 'year' | 'month' | 'quarter' | 'half_year'; inspectionDate: string;
  createdAt: string; updatedAt: string; notes: string;
};
export type InspectionAnswer = { propertyId: string; itemId: string; status: CheckStatus; note: string; updatedAt: string };
export type PropertyCost = { id: string; propertyId: string; label: string; amount: number; kind: CostKind; refundable: boolean; frequency: 'once' | 'monthly' | 'yearly'; note: string };
export type InspectionNote = { id: string; propertyId: string; question: string; answer: string; resolved: boolean; createdAt: string };
export const CHECKLIST = [
  { section: 'The building', items: [{ id:'building-structure', label:'Visible cracks, damp, or structural concerns', help:'Look at walls, ceilings, corners, and around windows.' },{ id:'roof-ceiling', label:'Roof and ceiling condition', help:'Check for stains, sagging, leaks, or fresh paint hiding damage.' },{ id:'doors-windows', label:'Doors, windows, locks, and security fittings', help:'Open and close them. Check that locks work from inside and outside.' },{ id:'ventilation', label:'Natural light and ventilation', help:'Open windows and consider airflow, heat, and privacy.' }]},
  { section: 'Water and power', items: [{ id:'water-flow', label:'Water supply and water pressure', help:'Run taps and ask how reliable the supply is.' },{ id:'drainage', label:'Toilets, drains, and sewage', help:'Flush toilets and check for slow drainage or odours.' },{ id:'electricity', label:'Sockets, switches, and visible wiring', help:'Test accessible switches and look for exposed or damaged wiring. Do not touch unsafe wiring.' },{ id:'meter', label:'Electricity meter and billing arrangement', help:'Confirm whether the meter is prepaid, shared, or separately billed.' }]},
  { section: 'The property and surroundings', items: [{ id:'mobile-network', label:'Mobile network reception', help:'Check reception with your own phone in different rooms.' },{ id:'noise', label:'Noise, privacy, and neighbours', help:'Listen for road noise, nearby businesses, and shared-wall noise.' },{ id:'flooding', label:'Signs of flooding or poor drainage outside', help:'Look for water marks, blocked drains, low points, and ask about heavy rain.' },{ id:'access', label:'Access road, transport, and everyday essentials', help:'Consider your commute, road condition, lighting, and nearby services.' }]},
  { section: 'Before you commit', items: [{ id:'landlord-agent', label:'Landlord or agent authority and identity', help:'Ask who you are dealing with and request verifiable documentation.' },{ id:'agreement', label:'Tenancy agreement and key terms', help:'Review duration, renewal, notice, repairs, and termination terms.' },{ id:'fees', label:'Every fee and payment recipient explained', help:'Get a written breakdown and receipt details before paying.' },{ id:'repairs', label:'Repairs and outstanding work agreed in writing', help:'Record who will fix what and by which date.' }]},
];

export type InspectionPhoto = { id: string; propertyId: string; name: string; mimeType: string; blob: Blob; caption: string; createdAt: string };
