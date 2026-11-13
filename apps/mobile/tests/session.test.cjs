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
async function session(initial = {}) {
  const storage = new Map(Object.entries(initial));
  const alerts = []; const effects = []; let fetcher;
  const api = load('api.ts', { './config': { API_BASE_URL: 'http://local.test' } }, { fetch: (...args) => fetcher(...args) });
  const react = { createContext: () => ({Provider:'Provider'}), useRef: value => ({current:value}), useState: value => [value, () => {}], useCallback: fn=>fn, useMemo: fn=>fn(), useEffect: fn=>effects.push(fn), createElement: (type, props)=>({ type, props }) };
  const expiry = load('tokenExpiry.ts', {});
  const provider = load('session.tsx', {
    react, 'react-native': { Alert:{alert:(...args)=>alerts.push(args)}, AppState:{ currentState:'active', addEventListener:()=>({remove(){}}) } },
    'expo-secure-store': { getItemAsync:async key=>storage.get(key)??null, setItemAsync:async(key,value)=>{storage.set(key,value);}, deleteItemAsync:async key=>{storage.delete(key);} },
    './api':api, './tokenExpiry':expiry,
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
  const p=load('session.tsx',{react,'react-native':{Alert:{alert(){}},AppState:{}},'expo-secure-store':{getItemAsync:async k=>storage.get(k),setItemAsync:async(k,v)=>storage.set(k,v),deleteItemAsync:async k=>storage.delete(k)},'./api':api,'./tokenExpiry':load('tokenExpiry.ts',{})});
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
