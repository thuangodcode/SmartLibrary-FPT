const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const jwt = (seconds, sub = 'reader') => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+seconds, sub })).toString('base64url')}.signature`;
const response = (status, data) => new Response(JSON.stringify({ success: status < 400, data }), { status });
function load(file, modules, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: id => {
    if (!(id in modules)) throw Error('Unexpected import: '+id);
    return modules[id];
  }, console, atob, Date, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, ...globals });
  return module.exports;
}
async function session(initial = {}, googleSignIn = async () => null) {
  const storage = new Map(Object.entries(initial));
  const alerts = []; const effects = []; let fetcher;
  const api = load('api.ts', { './config': { API_BASE_URL: 'http://local.test' } }, { fetch: (...args) => fetcher(...args) });
  const react = { createContext: () => ({Provider:'Provider'}), useRef: value => ({current:value}), useState: value => [value, () => {}], useCallback: fn=>fn, useMemo: fn=>fn(), useEffect: fn=>effects.push(fn), createElement: (type, props)=>({ type, props }) };
  const expiry = load('tokenExpiry.ts', {});
  const provider = load('session.tsx', {
    react, 'react-native': { Alert:{alert:(...args)=>alerts.push(args)}, AppState:{ currentState:'active', addEventListener:()=>({remove(){}}) } },
    'expo-secure-store': { getItemAsync:async key=>storage.get(key)??null, setItemAsync:async(key,value)=>{storage.set(key,value);}, deleteItemAsync:async key=>{storage.delete(key);} },
    './api':api, './tokenExpiry':expiry, './googleAuth': { googleSignIn },
  });
  const value = provider.SessionProvider({ children:null }).props.value;
  const user={id:'reader',role:'Reader',status:'Active'};
  let nextLogin = jwt(3600);
  fetcher=async url=>url.endsWith('/login')?response(200,{accessToken:nextLogin,refreshToken:'refresh-1',user}):response(200,{user});
  effects[0](); effects[1]();
  // Let bootstrap settle before returning its public session API.
  await new Promise(resolve=>setImmediate(resolve));
  return {api,value,storage,alerts,user,setFetch:fn=>{fetcher=fn;},login:async token=>{nextLogin=token; await value.signIn('reader@example.test','test-password');}};
}

test('mobile coalesces parallel token factories and rotates the persisted refresh token', async()=>{
  const s=await session(); await s.login(jwt(30)); const next=jwt(7200); let calls=0;
  s.setFetch(async (url, options)=>{
    assert.ok(url.endsWith('/refresh')); calls++;
    assert.equal(options.headers['X-Client-Type'],'mobile');
    return response(200,{accessToken:next,refreshToken:'rotated'});
  });
  const tokens=await Promise.all(Array.from({length:8},()=>s.api.getSessionAccessToken()));
  assert.ok(tokens.every(token=>token===next)); assert.equal(calls,1);
  assert.equal(s.storage.get('sl_refresh_token'),'rotated');
});

test('mobile /auth/me recovers from 401 and retries with the refreshed bearer',async()=>{
  const s=await session(); const old=jwt(3600); await s.login(old); const next=jwt(7200); let refreshes=0;
  s.setFetch(async (url, options)=>{
    if(url.endsWith('/refresh')) {refreshes++;return response(200,{accessToken:next,refreshToken:'rotated'});}
    return options.headers.Authorization===`Bearer ${old}`?response(401):response(200,{user:s.user});
  });
  assert.equal((await s.api.apiRequest('/api/v1/auth/me',{},old)).data.user.id,'reader');
  assert.equal(refreshes,1);
});

test('mobile rejected refresh expires the session, instead of repeatedly negotiating with stale credentials',async()=>{
  const s=await session(); await s.login(jwt(30));
  s.setFetch(async()=>response(401));
  await assert.rejects(s.api.getSessionAccessToken(), e=>e.status===401);
  assert.equal(s.storage.has('sl_access_token'),false); assert.equal(s.storage.has('sl_refresh_token'),false);
  assert.equal(s.alerts.length,1);
  await assert.rejects(s.api.getSessionAccessToken(),e=>e.status===401);
  assert.equal(s.alerts.length,1);
});

test('mobile network failure preserves refresh credentials and can recover on the next attempt',async()=>{
  const s=await session(); await s.login(jwt(30));
  s.setFetch(async()=>{throw Error('offline');});
  await assert.rejects(s.api.getSessionAccessToken(),e=>e.status===0);
  assert.equal(s.storage.get('sl_refresh_token'),'refresh-1'); assert.equal(s.alerts.length,0);
  const next=jwt(7200);s.setFetch(async()=>response(200,{accessToken:next,refreshToken:'rotated'}));
  assert.equal(await s.api.getSessionAccessToken(),next);
});

test('logout during an in-flight mobile refresh cannot resurrect the old session',async()=>{
  const s=await session(); await s.login(jwt(30));
  let complete; let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  s.setFetch(async url=>{
    if(!url.endsWith('/refresh'))return response(200,{});
    entered();return new Promise(resolve=>{complete=resolve;});
  });
  const refreshing=s.api.getSessionAccessToken(); const rejected=assert.rejects(refreshing,e=>e.status===401);
  await started; await s.value.signOut(); complete(response(200,{accessToken:jwt(7200),refreshToken:'late'}));
  await rejected; assert.equal(s.storage.size,0);
});

test('mobile cold start refreshes an expired access token before validating /auth/me',async()=>{
  const old=jwt(-3600), next=jwt(7200); let handler; const effects=[]; const storage=new Map([['sl_access_token',old],['sl_refresh_token','saved']]);
  const react={createContext:()=>({Provider:'Provider'}),useRef:v=>({current:v}),useState:v=>[v,()=>{}],useCallback:fn=>fn,useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),createElement:(type,props)=>({type,props})};
  const calls=[]; const api={ApiError:class extends Error{},setSessionTokenHandler:fn=>{handler=fn;},apiRequest:async(path, options, token)=>{
    calls.push(path);
    if(path.endsWith('/refresh'))return {data:{accessToken:next,refreshToken:'rotated'}};
    assert.equal(await handler(),next);assert.equal(token,old);return {data:{user:{id:'reader',role:'Reader',status:'Active'}}};
  }};
  const p=load('session.tsx',{react,'react-native':{Alert:{alert(){}},AppState:{}},'expo-secure-store':{getItemAsync:async k=>storage.get(k),setItemAsync:async(k,v)=>storage.set(k,v),deleteItemAsync:async k=>storage.delete(k)},'./api':api,'./tokenExpiry':load('tokenExpiry.ts',{}),'./googleAuth':{googleSignIn:async()=>null}});
  p.SessionProvider({children:null});effects[0]();effects[1]();await new Promise(r=>setImmediate(r));
  assert.ok(calls.includes('/api/v1/auth/refresh'));assert.equal(storage.get('sl_access_token'),next);
});

test('expiry inspection handles near expiry and malformed tokens without trusting their signatures',()=>{
  const {isAccessTokenExpiring}=load('tokenExpiry.ts',{});
  assert.equal(isAccessTokenExpiring(jwt(7200)),false);
  assert.equal(isAccessTokenExpiring(jwt(30)),true);
  assert.equal(isAccessTokenExpiring('malformed'),true);
});

test('mobile does not replay a stale request under a different signed-in user',async()=>{
 const api=load('api.ts',{'./config':{API_BASE_URL:'http://local.test'}},{fetch:async()=>{throw Error('Must not send');}});
 api.setSessionTokenHandler(async()=>jwt(7200,'another-reader'));
 await assert.rejects(api.apiRequest('/api/v1/me/circulation/loans',{method:'POST'},jwt(3600,'reader')),e=>e.status===401);
});

test('mobile initial realtime failure retries with backoff and disposal cancels retries',async()=>{
 const timers=[];let startCount=0;let close;
 const hub={state:'Disconnected',start:async()=>{startCount++;throw Error('offline');},stop:async()=>{},onclose:fn=>{close=fn;}};
 const api={ApiError:class extends Error{},apiRequest:async()=>{},getSessionAccessToken:async()=>jwt(7200)};
 const realtime=load('realtime.ts',{'@microsoft/signalr':{HubConnectionState:{Disconnected:'Disconnected'},LogLevel:{Warning:3}},'./api':api},{setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout:id=>{if(id)timers[id-1].cancelled=true;}});
 const stop=realtime.startRealtime(hub,()=>{});
 await new Promise(r=>setImmediate(r));assert.equal(timers[0].delay,3000);
 timers[0].fn();await new Promise(r=>setImmediate(r));assert.equal(timers[1].delay,6000);
 stop();assert.equal(timers[1].cancelled,true);close();timers[1].fn();await new Promise(r=>setImmediate(r));assert.equal(startCount,2);
});

test('mobile negotiate waits for an in-progress forced refresh, even when old JWT expiry is in the future',async()=>{
 const s=await session();await s.login(jwt(3600));let complete;let entered;
 const started=new Promise(resolve=>{entered=resolve;});
 s.setFetch(async()=>{entered();return new Promise(resolve=>{complete=resolve;});});
 const forced=s.api.getSessionAccessToken(true);await started;
 const factory=s.api.getSessionAccessToken();const next=jwt(7200);
 complete(response(200,{accessToken:next,refreshToken:'rotated'}));
 assert.equal(await factory,next);assert.equal(await forced,next);
});


test('mobile Google exchange saves the library profile and refresh token, including unverified status', async () => {
  const google = { accessToken: jwt(3600), refreshToken: 'google-refresh', email: 'reader@example.test', fullName: 'Reader' };
  const r = await session({}, async () => google);
  r.setFetch(async (url, options) => {
    assert.ok(url.endsWith('/auth/google/exchange'));
    assert.equal(JSON.parse(options.body).accessToken, google.accessToken);
    return response(200, { user: { ...r.user, isVerified: false } });
  });
  await r.value.signInWithGoogle();
  assert.equal(r.storage.get('sl_refresh_token'), 'google-refresh');
  assert.equal(JSON.parse(r.storage.get('sl_user')).isVerified, false);
  assert.equal(await r.api.getSessionAccessToken(), google.accessToken);
});

test('mobile Google cancel and unsupported Admin never persist credentials', async () => {
  const cancelled = await session();
  await cancelled.value.signInWithGoogle();
  assert.equal(cancelled.storage.size, 0);
  const r = await session({}, async () => ({ accessToken: jwt(3600), refreshToken: 'google-refresh', email: 'admin@example.test' }));
  r.setFetch(async () => response(200, { user: { ...r.user, role: 'Admin' } }));
  await assert.rejects(r.value.signInWithGoogle(), /chỉ hỗ trợ/);
  assert.equal(r.storage.size, 0);
});

test('mobile logout while Google exchange is pending cannot restore credentials', async () => {
  const r = await session({}, async () => ({ accessToken: jwt(3600), refreshToken: 'google-refresh', email: 'reader@example.test' }));
  let finish;
  r.setFetch(() => new Promise(resolve => { finish = resolve; }));
  const signingIn = r.value.signInWithGoogle();
  await new Promise(resolve => setImmediate(resolve));
  await r.value.signOut();
  finish(response(200, { user: r.user }));
  await signingIn;
  assert.equal(r.storage.size, 0);
});

test('mobile profile refresh persists verification without losing the refresh token', async () => {
  const r = await session();
  await r.login(jwt(3600));
  r.setFetch(async () => response(200, { user: { ...r.user, fullName: 'Verified Reader', isVerified: true } }));
  await r.value.refreshUser();
  assert.equal(JSON.parse(r.storage.get('sl_user')).isVerified, true);
  assert.equal(r.storage.get('sl_refresh_token'), 'refresh-1');
});

test('mobile Google uses PKCE and only exchanges a code from its own callback', async () => {
  const crypto = require('node:crypto');
  const bytes = new Uint8Array(32).fill(5);
  const verifier = Buffer.from(bytes).toString('hex');
  let callback = 'smartlibrary://google-auth?code=one-time-code';
  let fetches = 0;
  const oauth = load('googleAuth.ts', {
    'expo-constants': { __esModule: true, default: { executionEnvironment: 'standalone' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
    'expo-crypto': { getRandomBytesAsync: async () => bytes, CryptoDigestAlgorithm: { SHA256: 'SHA256' }, CryptoEncoding: { BASE64: 'BASE64' }, digestStringAsync: async (_, text) => crypto.createHash('sha256').update(text).digest('base64') },
    'expo-web-browser': { openAuthSessionAsync: async url => {
      const params = new URL(url).searchParams;
      assert.equal(params.get('code_challenge_method'), 's256');
      assert.equal(params.get('code_challenge'), crypto.createHash('sha256').update(verifier).digest('base64url'));
      return { type: 'success', url: callback };
    } },
  }, { process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://auth.example.test', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-key' } }, URL, URLSearchParams,
    fetch: async (_, options) => {
      fetches++;
      assert.deepEqual(JSON.parse(options.body), { auth_code: 'one-time-code', code_verifier: verifier });
      return new Response(JSON.stringify({ access_token: 'access', refresh_token: 'refresh', user: { email: 'reader@example.test' } }));
    } });
  assert.equal((await oauth.googleSignIn()).refreshToken, 'refresh');
  callback = 'malicious://google-auth?code=one-time-code';
  await assert.rejects(oauth.googleSignIn(), /hợp lệ/);
  assert.equal(fetches, 1);
});


test('mobile unverified pending Reader can reach verification while suspended accounts stay blocked', async () => {
  for (const status of ['PendingVerification', 'PendingDocuments', 'PendingApproval', 'Suspended']) {
    const r = await session({}, async () => ({ accessToken: jwt(3600), refreshToken: 'google-refresh', email: 'reader@example.test' }));
    r.setFetch(async () => response(200, { user: { ...r.user, status, isVerified: false } }));
    if (status === 'Suspended') {
      await assert.rejects(r.value.signInWithGoogle());
      assert.equal(r.storage.size, 0);
    } else {
      await r.value.signInWithGoogle();
      assert.equal(JSON.parse(r.storage.get('sl_user')).status, status);
    }
  }
});
