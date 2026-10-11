import { useState, type FormEvent } from 'react';
import { Cloud, CloudDownload, CloudUpload, LockKeyhole, LogIn, LogOut, Trash2, UserPlus } from 'lucide-react';
import { getAnswers, getCosts, getNotes, getPhotos, getProperties, importBackupData } from './db';
import { isBackupFileSizeAllowed, MAX_BACKUP_BYTES, validateBackupPayload } from './backup';
import type { InspectionAnswer, InspectionNote, InspectionPhoto, PropertyCost, PropertyRecord } from './types';

type CloudConfig = { region: string; userPoolId: string; clientId: string; apiUrl: string };
const config: CloudConfig = {
  region: import.meta.env.VITE_AWS_REGION ?? '',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  apiUrl: (import.meta.env.VITE_RENT_API_URL ?? '').replace(/\/$/, ''),
};
const configured = Boolean(config.region && config.userPoolId && config.clientId && config.apiUrl);
const tokenKey = 'byr-cloud-session';
type Tokens = { idToken: string; accessToken: string; refreshToken: string; expiresAt: number };
type CloudBackupPayload = {
  schemaVersion: number;
  exportedAt: string;
  properties: PropertyRecord[];
  details: Array<{ id: string; answers: InspectionAnswer[]; costs: PropertyCost[]; notes: InspectionNote[]; photos: Array<Omit<InspectionPhoto, 'blob'> & { blob: string }> }>;
};
type ApiResult = { uploadUrl?: string; downloadUrl?: string; exists?: boolean; updatedAt?: string | null; size?: number | null; deleted?: boolean; message?: string };

function readTokens(): Tokens | null {
  try {
    const value = sessionStorage.getItem(tokenKey);
    return value ? JSON.parse(value) as Tokens : null;
  } catch { return null; }
}
function saveTokens(value: Tokens | null) {
  if (value) sessionStorage.setItem(tokenKey, JSON.stringify(value));
  else sessionStorage.removeItem(tokenKey);
}
function decodeExpiry(token: string): number {
  try {
    const payload = token.split('.')[1];
    return Number(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).exp ?? 0) * 1000;
  } catch { return 0; }
}
async function cognito(target: string, body: Record<string, unknown>) {
  const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${target}` },
    body: JSON.stringify(body),
  });
  const data = await response.json() as { __type?: string; message?: string; [key: string]: unknown };
  if (!response.ok) {
    const code = (data.__type ?? '').split('#').pop();
    const messages: Record<string, string> = {
      UsernameExistsException: 'An account already exists for this email. Sign in instead.',
      UserNotFoundException: 'No account was found for that email.',
      NotAuthorizedException: 'The email or password is incorrect, or the session has expired.',
      CodeMismatchException: 'That confirmation code is incorrect. Check the email and try again.',
      ExpiredCodeException: 'That confirmation code has expired. Request another code.',
      InvalidPasswordException: 'Use a password of at least 12 characters with uppercase, lowercase, a number, and a symbol.',
      TooManyRequestsException: 'Too many attempts. Wait a little before trying again.',
      LimitExceededException: 'Too many attempts. Wait before requesting another code.',
    };
    throw new Error(messages[code ?? ''] ?? data.message ?? 'Authentication failed. Try again.');
  }
  return data;
}
async function signIn(email: string, password: string): Promise<Tokens> {
  const data = await cognito('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: config.clientId, AuthParameters: { USERNAME: email, PASSWORD: password } });
  const result = data.AuthenticationResult as { IdToken?: string; AccessToken?: string; RefreshToken?: string };
  if (!result?.IdToken || !result.AccessToken) throw new Error('Sign-in requires an additional verification step that this version does not support. Contact support.');
  const tokens = { idToken: result.IdToken, accessToken: result.AccessToken, refreshToken: result.RefreshToken ?? '', expiresAt: decodeExpiry(result.IdToken) };
  saveTokens(tokens);
  return tokens;
}
async function validIdToken(): Promise<string> {
  const current = readTokens();
  if (!current) throw new Error('Sign in to use cloud backup.');
  if (current.expiresAt > Date.now() + 60_000) return current.idToken;
  if (!current.refreshToken) { saveTokens(null); throw new Error('Your session expired. Sign in again.'); }
  const data = await cognito('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: config.clientId, AuthParameters: { REFRESH_TOKEN: current.refreshToken } });
  const result = data.AuthenticationResult as { IdToken?: string; AccessToken?: string };
  if (!result?.IdToken || !result.AccessToken) { saveTokens(null); throw new Error('Your session expired. Sign in again.'); }
  const next = { ...current, idToken: result.IdToken, accessToken: result.AccessToken, expiresAt: decodeExpiry(result.IdToken) };
  saveTokens(next);
  return next.idToken;
}
async function apiRequest(method: 'GET' | 'PUT' | 'DELETE'): Promise<ApiResult> {
  const token = await validIdToken();
  const response = await fetch(config.apiUrl + '/backup', { method, headers: { Authorization: `Bearer ${token}', ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}) } });
  const data = await response.json() as ApiResult;
  if (!response.ok) throw new Error(data.message ?? 'The cloud backup service could not be reached.');
  return data;
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function dataUrlToBlob(value: string): Blob {
  const parts = value.split(',');
  if (parts.length !== 2 || !parts[0].startsWith('data:image/')) throw new Error('A photo in the cloud backup is invalid.');
  const mime = parts[0].slice(5).split(';')[0];
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
async function makeBackup(): Promise<Blob> {
  const properties = await getProperties();
  const details = await Promise.all(properties.map(async property => ({
    id: property.id,
    answers: await getAnswers(property.id),
    costs: await getCosts(property.id),
    notes: await getNotes(property.id),
    photos: await Promise.all((await getPhotos(property.id)).map(async photo => ({ ...photo, blob: await blobToDataUrl(photo.blob) }))),
  })));
  const payload: CloudBackupPayload = { schemaVersion: 1, exportedAt: new Date().toISOString(), properties, details };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  if (!isBackupFileSizeAllowed(blob.size) || blob.size > MAX_BACKUP_BYTES) throw new Error('This backup exceeds the 50 MB limit. Reduce or remove large photos and try again.');
  return blob;
}

export default function CloudBackupPanel() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'confirm'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [signedIn, setSignedIn] = useState(() => Boolean(readTokens()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastBackup, setLastBackup] = useState('');

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  }
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (mode === 'signup') {
        await cognito('SignUp', { ClientId: config.clientId, Username: email.trim(), Password: password, UserAttributes: [{ Name: 'email', Value: email.trim() }] });
        setMode('confirm');
        setNotice('Check your email for the confirmation code.');
      } else if (mode === 'confirm') {
        await cognito('ConfirmSignUp', { ClientId: config.clientId, Username: email.trim(), ConfirmationCode: code.trim() });
        await signIn(email.trim(), password);
        setSignedIn(true);
        setNotice('Email confirmed. You are signed in.');
      } else {
        await signIn(email.trim(), password);
        setSignedIn(true);
        setNotice('Signed in. Your local records have not been uploaded automatically.');
      }
    });
  }
  async function uploadBackup() {
    await run(async () => {
      if (!window.confirm('Replace the existing cloud backup for this account with a snapshot of the records in this browser? This does not change your local records.')) return;
      const blob = await makeBackup();
      const { uploadUrl } = await apiRequest('PUT');
      if (!uploadUrl) throw new Error('The cloud service did not return an upload URL.');
      const uploaded = await fetch(uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: blob });
      if (!uploaded.ok) throw new Error('The backup upload failed. Your local records are unchanged.');
      setLastBackup(new Date().toISOString());
      setNotice(`Cloud backup saved (${(blob.size / 1024 / 1024).toFixed(2)} MB). Keep your sign-in details private.`);
    });
  }
  async function restoreBackup() {
    await run(async () => {
      const result = await apiRequest('GET');
      if (!result.exists || !result.downloadUrl) { setNotice('There is no cloud backup for this account yet.'); return; }
      if (!window.confirm('Restore the cloud backup into this browser? This merges records by ID and overwrites matching records. Other local records remain. Export a local backup first if you need a rollback.')) return;
      const response = await fetch(result.downloadUrl);
      if (!response.ok) throw new Error('The cloud backup could not be downloaded.');
      const payload = await response.json() as CloudBackupPayload;
      const validationError = validateBackupPayload(payload);
      if (validationError) throw new Error('The cloud backup failed validation: ' + validationError);
      const details = payload.details.map(detail => ({
        id: detail.id,
        answers: detail.answers,
        costs: detail.costs,
        notes: detail.notes,
        photos: detail.photos.map(photo => ({ ...photo, blob: dataUrlToBlob(photo.blob) })),
      }));
      await importBackupData(payload.properties, details);
      setLastBackup(result.updatedAt ?? '');
      setNotice(`Restored ${payload.properties.length} properties. Refresh the workspace if the list does not update immediately.`);
    });
  }
  async function deleteBackup() {
    await run(async () => {
      if (!window.confirm('Permanently delete the cloud backup for this account? Local records on this device will not be deleted.')) return;
      await apiRequest('DELETE');
      setLastBackup('');
      setNotice('Cloud backup deleted. Local records are unchanged.');
    });
  }

  return <section className="panel settings-panel cloud-backup-panel">
    <span className="settings-icon"><Cloud size={22}/></span>
    <h2>Optional cloud backup</h2>
    <p>Your working records remain on this device. An account lets you upload one private backup and restore it on another device. This is a manual snapshot, not live sync.</p>
    {!configured ? <div className="cloud-config-notice"><b>Cloud backup is not configured yet.</b><p>Deploy the AWS stack in <code>infra/template.yaml</code>, then add its outputs as Vercel environment variables. Until then, your local records and JSON export continue to work normally.</p></div> : !signedIn ? <>
      <div className="cloud-privacy-note"><LockKeyhole size={17}/><span>Backups are private to your account. Sign-in is handled by Amazon Cognito; files are stored in a private, encrypted S3 bucket.</span></div>
      <form className="cloud-auth-form" onSubmit={submitAuth}>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} maxLength={254}/></label>
        <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} minLength={12}/></label>
        {mode === 'confirm' && <label>Email confirmation code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} required/></label>}
        <button className="button-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? <><UserPlus size={16}/> Create account</> : mode === 'confirm' ? 'Confirm email and sign in' : <><LogIn size={16}/> Sign in</>}</button>
      </form>
      <div className="cloud-auth-switch">{mode === 'confirm' ? <button onClick={() => void run(async () => { await cognito('ResendConfirmationCode', { ClientId: config.clientId, Username: email.trim() }); setNotice('A new confirmation code has been sent.'); })} disabled={busy}>Resend code</button> : <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}>{mode === 'signin' ? 'Create a cloud backup account' : 'Already have an account? Sign in'}</button>}</div>
    </> : <>
      <div className="cloud-signed-in"><span><span className="online-dot"/> Signed in as {email || 'your account'}</span><button className="button-secondary" onClick={() => { saveTokens(null); setSignedIn(false); setPassword(''); setCode(''); setMode('signin'); setNotice('Signed out. Local records remain on this device.'); }}><LogOut size={15}/> Sign out</button></div>
      <div className="cloud-actions"><button className="button-primary" onClick={uploadBackup} disabled={busy}><CloudUpload size={16}/> Save cloud backup</button><button className="button-secondary" onClick={restoreBackup} disabled={busy}><CloudDownload size={16}/> Restore backup here</button><button className="button-secondary danger-action" onClick={deleteBackup} disabled={busy}><Trash2 size={15}/> Delete cloud backup</button></div>
      {lastBackup && <p className="cloud-last-backup">Last backup activity: {new Date(lastBackup).toLocaleString('en-NG')}</p>}
    </>}
    {error && <div className="alert-error" role="alert">{error}</div>}
    {notice && <div className="cloud-notice" role="status">{notice}</div>}
    <p className="cloud-caveat">Do not upload records from a shared or untrusted device. Cloud backup contains property addresses, notes, costs, and selected photo evidence. You can delete the cloud copy separately from local data.</p>
  </section>;
}
