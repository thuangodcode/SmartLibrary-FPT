const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('../node_modules/typescript');
const jwt=seconds=>`header.${Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+seconds})).toString('base64url')}.signature`;
const response=(status,data)=>new Response(JSON.stringify({success:status<400,data}),{status});
function store() {
  const values=new Map();let fetcher;
  const create=init=>{let state;const get=()=>state;const set=change=>{state={...state,...change};};state=init(set,get);return {getState:get};};
  const source=fs.readFileSync(__dirname+'/../src/features/auth/store/useAuthStore.ts','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:id=>({zustand:{create},'../../../config':{API_BASE_URL:'http://local.test'},'../../../lib/api':{parseApiResponse:r=>r.json()}})[id],localStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetch:(...args)=>fetcher(...args),atob,Date,AbortSignal});
  const auth=module.exports.useAuthStore;
  auth.getState().setAuth({id:'reader',role:'Reader',status:'Active'},jwt(30));
  return {auth,values,recover:module.exports.recoverRealtimeSession,setFetch:fn=>{fetcher=fn;}};
}
test('web coalesces simultaneous refreshes from polling and both SignalR hubs',async()=>{
 const s=store();let count=0;const next=jwt(7200);
 s.setFetch(async()=>{count++;return response(200,{accessToken:next});});
 assert.ok((await Promise.all(Array.from({length:8},()=>s.auth.getState().getAccessToken()))).every(t=>t===next));
 assert.equal(count,1);assert.equal(s.values.get('sl_token'),next);
});
test('web returns a fresh in-memory token without unnecessary refresh requests',async()=>{
 const s=store();const next=jwt(7200);s.auth.getState().setAccessToken(next);
 s.setFetch(async()=>{throw Error('Unexpected network request');});
 assert.equal(await s.auth.getState().getAccessToken(),next);
});
test('web invalid refresh returns to login while temporary server errors keep the session',async()=>{
 for(const status of [400,401,503]){
  const s=store();s.setFetch(async()=>response(status));
  await assert.rejects(s.auth.getState().getAccessToken());
  assert.equal(s.auth.getState().isAuthenticated,status===503);
  assert.equal(s.values.has('sl_token'),status===503);
 }
});
test('web network failure can be retried without deleting credentials',async()=>{
 const s=store();s.setFetch(async()=>{throw Error('offline');});
 await assert.rejects(s.auth.getState().getAccessToken());assert.equal(s.auth.getState().isAuthenticated,true);
 s.setFetch(async()=>response(200,{accessToken:jwt(7200)}));
 assert.ok(await s.auth.getState().getAccessToken());
});
test('web logout and a new login cannot be overwritten by a late refresh response',async()=>{
 for(const relogin of [false,true]){
  const s=store();let complete;s.setFetch(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=s.auth.getState().getAccessToken();const rejected=assert.rejects(pending);
  s.auth.getState().logout();const newToken=jwt(9000);
  if(relogin)s.auth.getState().setAuth({id:'another-reader',role:'Reader',status:'Active'},newToken);
  complete(response(200,{accessToken:jwt(7200)}));await rejected;
  assert.equal(s.values.get('sl_token'),relogin?newToken:undefined);
 }
});
test('web hydration refreshes once then verifies the profile with the new bearer',async()=>{
 const s=store();const next=jwt(7200);let refreshes=0;
 s.setFetch(async(url,options)=>{
  if(url.endsWith('/refresh')){refreshes++;return response(200,{accessToken:next});}
  assert.equal(options.headers.Authorization,`Bearer ${next}`);
  return response(200,{user:{id:'reader',role:'Reader',status:'Active',permissions:[]}});
 });
 await s.auth.getState().hydrate();assert.equal(refreshes,1);assert.equal(s.auth.getState().accessToken,next);assert.equal(s.auth.getState().isLoading,false);
});

test('web negotiate waits for an in-progress forced refresh rather than reusing a rejected JWT',async()=>{
 const s=store();s.auth.getState().setAccessToken(jwt(3600));let complete;
 s.setFetch(()=>new Promise(resolve=>{complete=resolve;}));
 const forced=s.auth.getState().getAccessToken(true);const factory=s.auth.getState().getAccessToken();const next=jwt(7200);
 complete(response(200,{accessToken:next}));assert.equal(await forced,next);assert.equal(await factory,next);
});

test('web a permanently rejected negotiate expires the session after validating the refreshed identity',async()=>{
 const s=store();s.setFetch(async url=>url.endsWith('/refresh')?response(200,{accessToken:jwt(7200)}):response(401));
 assert.equal(await s.recover(new Error('Unauthorized: status 401')),true);
 assert.equal(s.auth.getState().isAuthenticated,false);
});
test('web stale realtime identity validation cannot log out a newly signed-in account',async()=>{
 const s=store();let complete;let entered;const started=new Promise(resolve=>{entered=resolve;});
 s.setFetch(async url=>{
  if(url.endsWith('/refresh'))return response(200,{accessToken:jwt(7200)});
  entered();return new Promise(resolve=>{complete=resolve;});
 });
 const pending=s.recover(new Error('status 401'));await started;
 const next=jwt(9000);s.auth.getState().setAuth({id:'new-user',role:'Reader',status:'Active'},next);
 complete(response(401));await pending;assert.equal(s.auth.getState().accessToken,next);assert.equal(s.auth.getState().user.id,'new-user');
});
