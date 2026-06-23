// src/worker.js — Stock-AI: ตัวนับยอดวิว + Like/Dislike
// แหล่งข้อมูลจริง (source of truth) = Durable Object เดียวทั้งระบบ (SQLite-backed)
//   env.COUNTERS.idFromName('global') → instance เดียวทั่วโลก → นับเป๊ะ strongly-consistent
//   ไม่มี per-colo divergence แบบ rate-limit binding อีกต่อไป
//
// เส้นทาง (route/JSON เหมือนเดิมทุกอย่าง — ฝั่ง client/อินเจกต์ไม่ต้องแก้):
//   POST /api/views/<SYM>            → +1 view, คืน { symbol, count, likes, dislikes }
//   GET  /api/views/<SYM>            → อ่าน { symbol, count, likes, dislikes }
//   GET  /api/views                  → batch { "<SYM>": {c,l,d}, ... } (หน้า index — แคช edge 60 วิ)
//   POST /api/vote/<SYM>?from=&to=   → โหวต (from/to ∈ none|like|dislike), server คิด delta เอง (∈ -1..1)
//                                       คืน { symbol, likes, dislikes }
//   อื่น ๆ                            → เสิร์ฟไฟล์ static ผ่าน ASSETS
//
// กันบอต: view/vote นับเฉพาะคำขอที่ "มาจากหน้าเว็บเราเอง (Origin/Sec-Fetch) + UA ไม่ใช่บอต" (ดู countable())
//   บอตได้รับค่าปัจจุบัน (200) แต่ไม่ถูก +1 → หน้าเว็บไม่พัง แต่ยอดไม่เพี้ยนจากบอต/การยิง API ตรง
// เริ่มนับใหม่จาก 0 (ไม่ migrate เลขเก่า) — DO เป็น source of truth ตั้งแต่ deploy แรก
// D1 (ตาราง views เดิม) เหลือเป็นแค่ "mirror สำรอง" — เขียนแบบ best-effort (waitUntil) ไม่อ่านบน hot path
//   เก็บไว้เป็น backup เฉย ๆ (ไม่ต้อง setup อะไร) — จะถอดทิ้งทีหลังก็ได้ (ดู DEPLOY.md)
//
// หมายเหตุ: ไฟล์ static เสิร์ฟจาก edge cache ไม่ผ่าน Worker → ฟรี/ไม่จำกัด; มีเฉพาะ /api/* ที่เรียก Worker + DO

import { DurableObject } from 'cloudflare:workers';

const SYM_RE = /^[A-Z0-9.\-]{1,10}$/;
const VOTES = new Set(['none', 'like', 'dislike']);
let KNOWN = null; // cache รายชื่อ symbol ที่ถูกต้อง (ต่อ isolate) — กันสร้าง row ขยะ

// ── กันบอต: นับ view/vote เฉพาะคำขอที่ "มาจากหน้าเว็บเราเอง + ไม่ใช่บอต" ──
// บอตที่ไม่รัน JS จะไม่ยิง POST อยู่แล้ว; 2 ด่านนี้กันบอตที่ render JS + การยิง API ตรง (curl/script)
const BOT_RE =
  /bot|crawl|spider|slurp|headless|python-requests|curl|wget|libwww|scrapy|phantom|puppeteer|playwright|lighthouse|monitor|uptime|preview|facebookexternalhit|whatsapp|telegram|discord|embedly|bingpreview|go-http|java\/|okhttp|axios|httpclient/i;
function isBot(request) {
  const ua = request.headers.get('User-Agent') || '';
  return !ua || BOT_RE.test(ua); // ไม่มี UA = ถือเป็นบอต (เบราว์เซอร์จริงส่ง UA เสมอ)
}
// เบราว์เซอร์จริงส่ง Origin (บน POST) + Sec-Fetch-Site บนคำขอ same-origin; curl/script ทั่วไปไม่ส่ง
function fromOurPage(request, url) {
  return request.headers.get('Origin') === url.origin || request.headers.get('Sec-Fetch-Site') === 'same-origin';
}
// คำขอที่ "ควรนับ" = จากหน้าเว็บเราเอง และไม่ใช่บอต
function countable(request, url) {
  return fromOurPage(request, url) && !isBot(request);
}

async function knownSymbols(env, url) {
  if (KNOWN) return KNOWN;
  try {
    const res = await env.ASSETS.fetch(new URL('/reports.json', url).toString());
    const list = await res.json();
    KNOWN = new Set(list.map((r) => String(r.symbol).toUpperCase()));
  } catch {
    KNOWN = new Set(); // อ่านไม่ได้ → ไม่ตรวจ whitelist (ยังมี regex กันอยู่)
  }
  return KNOWN;
}

function json(obj, { status = 200, cache = 'no-store' } = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache },
  });
}

// ตรวจ symbol: รูปแบบถูก + อยู่ในรายชื่อจริง (ถ้าโหลดรายชื่อได้)
async function validSym(raw, env, url) {
  const sym = decodeURIComponent(raw).toUpperCase();
  if (!SYM_RE.test(sym)) return { err: json({ error: 'bad symbol' }, { status: 400 }) };
  const ok = await knownSymbols(env, url);
  if (ok.size && !ok.has(sym)) return { err: json({ error: 'unknown symbol' }, { status: 404 }) };
  return { sym };
}

// เขียน mirror ลง D1 แบบ best-effort (ไม่ await บน response path, ไม่เคยอ่านกลับบน hot path)
// — ถอด [[d1_databases]] ออกเมื่อไรโค้ดนี้จะข้ามไปเอง(env.DB undefined)
function mirrorD1(env, ctx, d) {
  if (!env.DB) return;
  ctx.waitUntil(
    env.DB.prepare(
      `INSERT INTO views (symbol, count, likes, dislikes, updated) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(symbol) DO UPDATE SET count = ?2, likes = ?3, dislikes = ?4, updated = ?5`
    )
      .bind(d.symbol, d.count | 0, d.likes | 0, d.dislikes | 0, new Date().toISOString())
      .run()
      .catch(() => {})
  );
}

// ───────────────────────── Durable Object: ตัวนับเดียวทั้งระบบ ─────────────────────────
// instance เดียว (idFromName('global')) → ทุก isolate/colo ชี้มาที่เดียวกัน → single-threaded → นับไม่มีหลุด
export class Counters extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql; // SQLite-backed (ต้องสร้างด้วย new_sqlite_classes)
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS counters (
         symbol   TEXT PRIMARY KEY,
         count    INTEGER NOT NULL DEFAULT 0,
         likes    INTEGER NOT NULL DEFAULT 0,
         dislikes INTEGER NOT NULL DEFAULT 0,
         updated  TEXT
       )`
    );
  }

  _row(symbol) {
    const r = this.sql.exec('SELECT count, likes, dislikes FROM counters WHERE symbol = ?', symbol).toArray()[0];
    return { symbol, count: r ? r.count : 0, likes: r ? r.likes : 0, dislikes: r ? r.dislikes : 0 };
  }

  // +1 view — single-threaded read-modify-write, ไม่มี lost update
  // ใช้ placeholder `?` ธรรมดา (ส่งค่าซ้ำตามจำนวนที่อ้าง) — รองรับชัวร์ทั้ง workerd DO / D1 / sqlite
  addView(symbol) {
    const now = new Date().toISOString();
    const r = this.sql
      .exec(
        `INSERT INTO counters (symbol, count, updated) VALUES (?, 1, ?)
         ON CONFLICT(symbol) DO UPDATE SET count = count + 1, updated = ?
         RETURNING count, likes, dislikes`,
        symbol,
        now,
        now
      )
      .toArray()[0];
    return { symbol, count: r.count, likes: r.likes, dislikes: r.dislikes };
  }

  // โหวต: dl/dd ถูก clamp -1..1 มาจาก Worker แล้ว; ที่นี่กันยอดรวมไม่ให้ติดลบ
  vote(symbol, dl, dd) {
    if (dl === 0 && dd === 0) return this._row(symbol);
    const now = new Date().toISOString();
    const r = this.sql
      .exec(
        `INSERT INTO counters (symbol, likes, dislikes, updated)
         VALUES (?, MAX(0, ?), MAX(0, ?), ?)
         ON CONFLICT(symbol) DO UPDATE SET
           likes    = MAX(0, likes + ?),
           dislikes = MAX(0, dislikes + ?),
           updated  = ?
         RETURNING count, likes, dislikes`,
        symbol,
        dl,
        dd,
        now,
        dl,
        dd,
        now
      )
      .toArray()[0];
    return { symbol, count: r.count, likes: r.likes, dislikes: r.dislikes };
  }

  getOne(symbol) {
    return this._row(symbol);
  }

  // batch ทั้ง index — scan ตารางเดียวในเครื่องเดียวกับที่เขียน → เป๊ะเสมอ
  all() {
    const map = {};
    for (const r of this.sql.exec('SELECT symbol, count, likes, dislikes FROM counters').toArray()) {
      map[r.symbol] = { c: r.count, l: r.likes, d: r.dislikes };
    }
    return map;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    // ไม่ใช่ API → เสิร์ฟ static (ไฟล์ส่วนใหญ่ถูก edge cache ตัดไปก่อนไม่ถึง Worker อยู่แล้ว)
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(request);

    // DO เดียวทั้งระบบ (สร้าง stub ตอนนี้ ราคาถูก ยังไม่มี I/O จนกว่าจะเรียกเมธอด)
    const stub = env.COUNTERS.get(env.COUNTERS.idFromName('global'));

    // ---- batch: ยอดวิว + likes ทุกตัว (หน้า index) — read-only + แคช 60 วิที่ edge ----
    if (p === '/api/views' && request.method === 'GET') {
      const cache = caches.default;
      const hit = await cache.match(request);
      if (hit) return hit;
      let map;
      try {
        map = await stub.all();
      } catch {
        return json({ error: 'do' }, { status: 500 });
      }
      const res = json(map, { cache: 'public, max-age=60' });
      ctx.waitUntil(cache.put(request, res.clone()));
      return res;
    }

    // ---- โหวต: /api/vote/<SYM>?from=&to= ----
    const mv = p.match(/^\/api\/vote\/([^/]+)$/);
    if (mv) {
      if (request.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 });
      const { sym, err } = await validSym(mv[1], env, url);
      if (err) return err;
      // rate limit (edge, per-colo) — ด่านกัน spam ก่อนใช้โควต้า DO; ความเป๊ะของยอดมาจาก DO แล้ว
      const ip = request.headers.get('CF-Connecting-IP') || 'anon';
      const { success } = await env.VOTE_LIMITER.limit({ key: `${ip}:${sym}` });
      if (!success) return json({ error: 'rate_limited' }, { status: 429 });
      const from = url.searchParams.get('from') || 'none';
      const to = url.searchParams.get('to') || 'none';
      if (!VOTES.has(from) || !VOTES.has(to)) return json({ error: 'bad vote' }, { status: 400 });
      // server คำนวณ delta เอง → คุมให้อยู่ใน -1..1 เสมอ (client ส่งเลขมั่วไม่ได้)
      const dl = (to === 'like' ? 1 : 0) - (from === 'like' ? 1 : 0);
      const dd = (to === 'dislike' ? 1 : 0) - (from === 'dislike' ? 1 : 0);
      try {
        // กันบอต/vote stuffing: นับเฉพาะโหวตจากหน้าเว็บเราเอง — อื่น ๆ คืนค่าปัจจุบันแต่ไม่เปลี่ยน
        if (!countable(request, url)) {
          const cur = await stub.getOne(sym);
          return json({ symbol: sym, likes: cur.likes, dislikes: cur.dislikes });
        }
        const d = await stub.vote(sym, dl, dd);
        if (dl !== 0 || dd !== 0) mirrorD1(env, ctx, d); // mirror เฉพาะตอนมีการเปลี่ยนจริง
        return json({ symbol: sym, likes: d.likes, dislikes: d.dislikes });
      } catch {
        return json({ error: 'do' }, { status: 500 });
      }
    }

    // ---- view รายตัว: /api/views/<SYM> ----
    const m = p.match(/^\/api\/views\/([^/]+)$/);
    if (m) {
      const { sym, err } = await validSym(m[1], env, url);
      if (err) return err;
      try {
        if (request.method === 'POST') {
          // rate limit (edge): 30 view-counts/60วิ ต่อ IP
          const ip = request.headers.get('CF-Connecting-IP') || 'anon';
          const { success } = await env.VIEW_LIMITER.limit({ key: ip });
          if (!success) return json({ error: 'rate_limited' }, { status: 429 });
          // นับเฉพาะ view จากหน้าเว็บเราเอง (กันบอต/ยิง API ตรง) — บอตได้ค่าปัจจุบันแต่ไม่ +1
          if (!countable(request, url)) {
            const cur = await stub.getOne(sym);
            return json({ symbol: sym, count: cur.count, likes: cur.likes, dislikes: cur.dislikes });
          }
          const d = await stub.addView(sym);
          mirrorD1(env, ctx, d);
          return json({ symbol: sym, count: d.count, likes: d.likes, dislikes: d.dislikes });
        }
        if (request.method === 'GET') {
          const d = await stub.getOne(sym);
          return json({ symbol: sym, count: d.count, likes: d.likes, dislikes: d.dislikes });
        }
        return json({ error: 'method not allowed' }, { status: 405 });
      } catch {
        return json({ error: 'do' }, { status: 500 });
      }
    }

    return json({ error: 'not found' }, { status: 404 });
  },
};
