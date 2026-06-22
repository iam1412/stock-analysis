// src/worker.js — Stock-AI: ตัวนับยอดวิว + Like/Dislike (Cloudflare Worker + D1)
//
// เส้นทาง:
//   POST /api/views/<SYM>            → +1 view, คืน { symbol, count, likes, dislikes }
//   GET  /api/views/<SYM>            → อ่าน { symbol, count, likes, dislikes }
//   GET  /api/views                  → batch { "<SYM>": {c,l,d}, ... } (หน้า index — แคช edge 60 วิ)
//   POST /api/vote/<SYM>?from=&to=   → โหวต (from/to ∈ none|like|dislike), server คิด delta เอง (∈ -1..1)
//                                       คืน { symbol, likes, dislikes }
//   อื่น ๆ                            → เสิร์ฟไฟล์ static ผ่าน ASSETS
//
// หมายเหตุ: ไฟล์ static เสิร์ฟจาก edge cache ไม่ผ่าน Worker → ฟรี/ไม่จำกัด; มีเฉพาะ /api/* ที่เรียก Worker + D1
'use strict';

const SYM_RE = /^[A-Z0-9.\-]{1,10}$/;
const VOTES = new Set(['none', 'like', 'dislike']);
let KNOWN = null; // cache รายชื่อ symbol ที่ถูกต้อง (ต่อ isolate) — กันสร้าง row ขยะ

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    // ---- batch: ยอดวิว + likes ทุกตัว (หน้า index) — read-only + แคช 60 วิที่ edge ----
    if (p === '/api/views' && request.method === 'GET') {
      const cache = caches.default;
      const hit = await cache.match(request);
      if (hit) return hit;
      const map = {};
      try {
        const { results } = await env.DB.prepare('SELECT symbol, count, likes, dislikes FROM views').all();
        for (const r of results) map[r.symbol] = { c: r.count, l: r.likes, d: r.dislikes };
      } catch {
        return json({ error: 'db' }, { status: 500 });
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
      // rate limit: 5 โหวต/60วิ ต่อ (IP + หุ้น)
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
        if (dl === 0 && dd === 0) {
          const row = await env.DB.prepare('SELECT likes, dislikes FROM views WHERE symbol = ?1').bind(sym).first();
          return json({ symbol: sym, likes: row ? row.likes : 0, dislikes: row ? row.dislikes : 0 });
        }
        const row = await env.DB.prepare(
          `INSERT INTO views (symbol, likes, dislikes, updated) VALUES (?1, MAX(0, ?2), MAX(0, ?3), ?4)
           ON CONFLICT(symbol) DO UPDATE SET
             likes = MAX(0, likes + ?2),
             dislikes = MAX(0, dislikes + ?3),
             updated = ?4
           RETURNING likes, dislikes`
        )
          .bind(sym, dl, dd, new Date().toISOString())
          .first();
        return json({ symbol: sym, likes: row ? row.likes : 0, dislikes: row ? row.dislikes : 0 });
      } catch {
        return json({ error: 'db' }, { status: 500 });
      }
    }

    // ---- view รายตัว: /api/views/<SYM> ----
    const m = p.match(/^\/api\/views\/([^/]+)$/);
    if (m) {
      const { sym, err } = await validSym(m[1], env, url);
      if (err) return err;
      try {
        if (request.method === 'POST') {
          // rate limit: 30 view-counts/60วิ ต่อ IP
          const ip = request.headers.get('CF-Connecting-IP') || 'anon';
          const { success } = await env.VIEW_LIMITER.limit({ key: ip });
          if (!success) return json({ error: 'rate_limited' }, { status: 429 });
          const row = await env.DB.prepare(
            `INSERT INTO views (symbol, count, updated) VALUES (?1, 1, ?2)
             ON CONFLICT(symbol) DO UPDATE SET count = count + 1, updated = ?2
             RETURNING count, likes, dislikes`
          )
            .bind(sym, new Date().toISOString())
            .first();
          return json({ symbol: sym, count: row ? row.count : 0, likes: row ? row.likes : 0, dislikes: row ? row.dislikes : 0 });
        }
        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT count, likes, dislikes FROM views WHERE symbol = ?1').bind(sym).first();
          return json({ symbol: sym, count: row ? row.count : 0, likes: row ? row.likes : 0, dislikes: row ? row.dislikes : 0 });
        }
        return json({ error: 'method not allowed' }, { status: 405 });
      } catch {
        return json({ error: 'db' }, { status: 500 });
      }
    }

    // ---- ไม่ใช่ API → เสิร์ฟ static ----
    return env.ASSETS.fetch(request);
  },
};
