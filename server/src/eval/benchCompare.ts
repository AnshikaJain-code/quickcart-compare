/**
 * CLI: `npm run bench:compare`. Measures POST /compare latency end to end (HTTP in, JSON out) against the
 * database named by MONGODB_URI, which must already be seeded (`npm run seed`). Writes p50/p95 to
 * docs/evaluation.md and exits 1 if p95 is not under 2 seconds.
 *
 * Numbers depend on where the database is: a local MongoDB is much faster than Atlas over the internet.
 * The report says which one was measured.
 */
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { connectDb, describeUri, disconnectDb } from '../config/db';
import { loadEnv } from '../config/env';
import { loadDotenv } from '../config/loadDotenv';
import { ids } from '../seed/ids';
import { upsertSection } from './docSections';

const LIMIT_MS = 2000;
const REQUESTS = Number(process.env.BENCH_REQUESTS ?? 300);
const WARMUP = 20;

const pid = (key: string) => ids.product(key).toHexString();
const basket = (...lines: [string, number][]) =>
  lines.map(([k, q]) => ({ productId: pid(k), quantity: q }));

const SCENARIOS = [
  {
    name: '3 items, 110001',
    body: {
      pinCode: '110001',
      items: basket(['milk-tt-500', 2], ['bread-white-400', 1], ['rice-1', 1]),
    },
  },
  {
    name: '3 items, 110002, balance',
    body: {
      pinCode: '110002',
      sortBy: 'balance',
      items: basket(['milk-tt-500', 2], ['rice-1', 1], ['dal-1', 1]),
    },
  },
  {
    name: '3 items, 110003, eta',
    body: {
      pinCode: '110003',
      sortBy: 'eta',
      items: basket(['milk-tt-500', 2], ['rice-1', 1], ['dal-1', 1]),
    },
  },
  {
    name: '15 items, 110001, partial',
    body: {
      pinCode: '110001',
      mode: 'partial',
      items: basket(
        ['milk-tt-500', 2],
        ['milk-tt-1000', 1],
        ['bread-white-400', 1],
        ['bun-4', 1],
        ['eggs-12', 1],
        ['rice-5', 1],
        ['atta-5', 1],
        ['dal-1', 1],
        ['sugar-1', 2],
        ['oil-1000', 1],
        ['chips-masala-52', 3],
        ['tea-250', 1],
        ['cola-750', 2],
        ['onion-1', 1],
        ['detergent-1', 1],
      ),
    },
  },
  {
    name: 'unsupported PIN 999999',
    body: { pinCode: '999999', items: basket(['milk-tt-500', 1]) },
  },
];

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
const ms = (n: number) => `${n.toFixed(1)} ms`;

async function main(): Promise<void> {
  loadDotenv();
  const env = loadEnv();
  await connectDb(env.MONGODB_URI);
  const providers = await mongoose.connection.collection('providers').countDocuments();
  if (providers === 0) throw new Error('The database is empty. Run `npm run seed` first.');

  const server = createApp(env, {
    rateLimits: {
      general: { windowMs: 60_000, limit: 1e9 },
      compare: { windowMs: 60_000, limit: 1e9 },
    },
  }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/compare`;
  const call = async (body: unknown) => {
    const t0 = performance.now();
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`unexpected status ${res.status}`);
    return performance.now() - t0;
  };

  for (let i = 0; i < WARMUP; i++)
    await call((SCENARIOS[i % SCENARIOS.length] as (typeof SCENARIOS)[number]).body);

  const all: number[] = [];
  const rows: string[] = [];
  const per = Math.ceil(REQUESTS / SCENARIOS.length);
  for (const s of SCENARIOS) {
    const times: number[] = [];
    for (let i = 0; i < per; i++) times.push(await call(s.body));
    all.push(...times);
    const sorted = [...times].sort((a, b) => a - b);
    rows.push(
      `| ${s.name} | ${per} | ${ms(percentile(sorted, 50))} | ${ms(percentile(sorted, 95))} | ${ms(sorted[sorted.length - 1] as number)} |`,
    );
  }
  const sorted = [...all].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const max = sorted[sorted.length - 1] as number;
  const host = describeUri(env.MONGODB_URI).split('/')[0] ?? '';
  const where = /mongodb\.net/.test(host)
    ? 'MongoDB Atlas (remote)'
    : /^(127\.0\.0\.1|localhost)/.test(host)
      ? 'MongoDB on the same machine'
      : `MongoDB at ${host}`;
  const pass = p95 < LIMIT_MS;

  const body = [
    '## /compare latency',
    '',
    `Run by \`npm run bench:compare\`. ${all.length} requests after ${WARMUP} warm-up requests, sequential, over HTTP, seeded data.`,
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| **p50** | **${ms(p50)}** |`,
    `| **p95** (gate: under ${LIMIT_MS} ms) | **${ms(p95)}** |`,
    `| p99 | ${ms(p99)} |`,
    `| max | ${ms(max)} |`,
    `| Gate | ${pass ? 'PASS' : 'FAIL'} |`,
    '',
    '| Scenario | Requests | p50 | p95 | max |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    `Measured against: **${where}**. Node ${process.version}, ${os.platform()} ${os.arch()}, ${os.cpus().length} CPU(s).`,
    '',
    '**How to read this.** The server does its own work in a few milliseconds; almost all of the time is database round trips (about 4 sequential steps per request, with providers queried in parallel). A database on the same machine therefore flatters the result. Over the internet to Atlas, add the network round-trip time to each step. Re-run `npm run bench:compare` against your own Atlas cluster and use that number, not this one, when you quote latency for your deployment.',
  ].join('\n');

  upsertSection(path.resolve(__dirname, '../../../docs/evaluation.md'), 'latency', body);
  console.log(
    `requests ${all.length}  p50 ${ms(p50)}  p95 ${ms(p95)}  p99 ${ms(p99)}  max ${ms(max)}  (${where})`,
  );
  console.log(pass ? 'PASS' : `FAIL: p95 is not under ${LIMIT_MS} ms`);
  server.close();
  if (!pass) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('bench failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
