import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

class KV {
  data = new Map();
  async get(key, type) { const v = this.data.get(key)?.value ?? null; return type === 'json' && v ? JSON.parse(v) : v; }
  async put(key, value, options) { this.data.set(key, { value, options }); }
  async list({ prefix }) { return { keys: [...this.data.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete: true }; }
}
const env = { ADMIN_PASSWORD: 'test-only', NOTIFY_KV: new KV() };
const request = (path, method='GET', body) => new Request(`https://worker.test${path}`, {
  method, headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('public inbox filters day 60 and future rows', async () => {
  const now = Date.now();
  for (const [id, start, end] of [['active',now-1000,now+10000],['expired',now-60*86400000,now],['future',now+10000,now+20000]]) {
    await env.NOTIFY_KV.put(`inbox:${id}`, JSON.stringify({ id, at:start, published_at:new Date(start).toISOString(), expires_at:new Date(end).toISOString() }));
  }
  const r = await worker.fetch(request('/inbox'), env);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await r.json()).items.map(i=>i.id), ['active']);
});

test('expired content is not served from a stale KV copy', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  await env.NOTIFY_KV.put(`content:${id}`, JSON.stringify({ expires_at:'2020-01-01T00:00:00Z' }));
  assert.equal((await worker.fetch(request(`/c/${id}.json`),env)).status,410);
});

test('send requires admin authentication', async () => {
  const r = await worker.fetch(new Request('https://worker.test/send', {method:'POST',body:'{}'}),env);
  assert.equal(r.status,401);
});

test('broadcast uses category topic, stable contract and expiring fallback; tests stay private', async () => {
  const pair = await crypto.subtle.generateKey({ name:'RSASSA-PKCS1-v1_5', modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256' }, true, ['sign','verify']);
  const der = await crypto.subtle.exportKey('pkcs8',pair.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({project_id:'test',client_email:'test@example.test',private_key:pem});
  const previous = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (url.includes('oauth2')) return Response.json({access_token:'mock',expires_in:3600});
    sent.push(JSON.parse(init.body).message);
    return Response.json({name:'projects/test/messages/accepted'});
  };
  try {
    for (const target of ['all','debug']) {
      const response = await worker.fetch(request('/send','POST', {target,
        notification:{title:'Quiz',body:'Try this'},data:{type:'quiz'},content:{id:'quiz-1',questions:[]}}), env);
      assert.equal(response.status,200);
      const result = await response.json();
      const m = sent.at(-1);
      assert.equal(m.topic,target==='all'?'category_quiz':'debug');
      assert.equal(m.data.schema_version,'1');
      assert.equal(m.data.message_id,result.message_id);
      assert.equal(Date.parse(m.data.expires_at)-Date.parse(m.data.published_at),60*86400000);
      assert.equal(result.stage,'fcm_accepted');
      assert.equal(env.NOTIFY_KV.data.has(`inbox:${result.message_id}`),target==='all');
      const saved = await env.NOTIFY_KV.get(`content:${result.message_id}`,'json');
      assert.equal(saved.expires_at,m.data.expires_at);
    }
  } finally { globalThis.fetch = previous; }
});
