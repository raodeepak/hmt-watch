#!/usr/bin/env node
// hmt-watch — alerts (ntfy push) when any official HMT Gandaberunda variant is back in stock.
// Runs on GitHub Actions on a schedule. Notify-only: never logs in, never buys.
// Reads the stock flag HMT's store embeds in its server-rendered page (__NEXT_DATA__),
// so no browser is needed.

const TARGETS = [
  { label: 'JGSL 01 — white dial, brown leather (the one)', id: '2c249e81-28b0-4a24-b724-24a4b70e8a16' },
  { label: 'JGSL 01 White — black leather',                  id: '40f8bc5a-f132-40e3-84b8-bde54541b0de' },
  { label: 'JGSS 01 — metal bracelet',                       id: '4e9888f6-fd77-472c-af5a-f93ce6394d44' },
  { label: 'JGSS 01 White — metal bracelet',                 id: 'ae83a55f-5649-4522-a719-839d6abae720' },
];
const BASE = 'https://www.hmtwatches.store/product/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TOPIC = process.env.NTFY_TOPIC;

export function parseStock(html, id) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __NEXT_DATA__ in page');
  const pp = JSON.parse(m[1])?.props?.pageProps;
  const v = pp?.catalog?.variantsInfo?.find(x => x.sku === id) ?? pp?.catalog?.variantsInfo?.[0];
  const a = v?.attributes;
  const av = a?.buyingOptions?.singlePurchase?.availability;
  if (!a || !av) throw new Error('stock fields not found (page layout changed?)');
  return {
    name: a.name,
    price: a.price?.discountedPrice ?? a.price?.mrp,
    inStock: av.inStock === true || av.isBuyable === true,
  };
}

async function ntfy(title, body, click) {
  if (!TOPIC) { console.log('NTFY_TOPIC not set — would have sent:', title); return; }
  const r = await fetch(`https://ntfy.sh/${TOPIC}`, {
    method: 'POST',
    headers: { Title: title.replace(/[^ -~]/g, '-'), Priority: 'urgent', Tags: 'watch,rotating_light', Click: click },
    body,
  });
  console.log('ntfy ->', r.status);
}

async function main() {
  let failures = 0;
  for (const t of TARGETS) {
    const url = BASE + t.id;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = parseStock(await r.text(), t.id);
      console.log(`${s.inStock ? 'IN STOCK ' : 'out      '} Rs${s.price}  ${s.name}  (${t.label})`);
      if (s.inStock) {
        await ntfy(`HMT Gandaberunda IN STOCK: ${s.name}`,
          `${t.label}\nRs ${s.price} — order now, it sells out within hours.\nDelivery 3-5 days, Rs 80 shipping.\n${url}`, url);
      }
    } catch (e) {
      failures++;
      console.log(`ERROR    ${t.label}: ${e.message}`);
    }
  }
  // If every page failed, fail the run so GitHub emails you that the watcher is broken.
  if (failures === TARGETS.length) { console.log('All checks failed.'); process.exit(1); }
}

if (process.argv[2] === '--notify-test') {
  ntfy('hmt-watch test', 'If you can read this, push alerts work. Nothing in stock yet.', BASE + TARGETS[0].id);
} else {
  main();
}
