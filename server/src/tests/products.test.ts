import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { seedDatabase } from '../seed/seed';
import { tokenise } from '../services/productService';
import { useTestDb } from './helpers';

useTestDb();
const app = createApp({ CLIENT_ORIGIN: 'http://localhost:5173' });
const get = (q: Record<string, unknown> = {}) => request(app).get('/api/v1/products').query(q);

beforeAll(async () => {
  await seedDatabase();
});

describe('GET /api/v1/products', () => {
  it('returns the first page with pagination metadata', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 40, totalPages: 2 });
    expect(res.body.data).toHaveLength(20);
    expect(res.body.data[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{24}$/),
      name: expect.any(String),
      brand: expect.any(String),
      category: expect.any(String),
      variant: expect.any(String),
      quantityValue: expect.any(Number),
      quantityUnit: expect.any(String),
      packLabel: expect.any(String),
      imageUrl: null,
      identifiers: { gtin: null, sku: null },
    });
  });

  it('pages through every product exactly once', async () => {
    const seen = new Set<string>();
    for (const page of [1, 2, 3]) {
      const res = await get({ page, limit: 15 });
      res.body.data.forEach((p: { id: string }) => seen.add(p.id));
    }
    expect(seen.size).toBe(40);
  });

  it('returns an empty page (not an error) beyond the last page', async () => {
    const res = await get({ page: 9, limit: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ data: [], total: 40, page: 9 });
  });

  it('searches by name, partial words, brand and variant (case-insensitive)', async () => {
    const names = async (query: string) =>
      (await get({ query })).body.data.map(
        (p: { packLabel: string; name: string; variant: string }) =>
          [p.name, p.variant, p.packLabel].filter(Boolean).join(' '),
      );
    expect(await names('milk')).toEqual(
      expect.arrayContaining([
        'Milk Full Cream 500 ml',
        'Milk Toned 1 L',
        'Milk Toned 500 ml',
        'Milk Chocolate Bar 50 g',
      ]),
    );
    expect((await get({ query: 'MIL' })).body.total).toBe(4);
    expect((await get({ query: 'meadow' })).body.total).toBe(6);
    expect((await get({ query: 'toned' })).body.total).toBe(2);
  });

  it('searches by size and keeps 500 ml and 1 L milk apart', async () => {
    const res = await get({ query: 'milk 500ml' });
    const labels = res.body.data.map((p: { name: string; variant: string; packLabel: string }) =>
      [p.name, p.variant, p.packLabel].filter(Boolean).join(' '),
    );
    expect(labels).toEqual(['Milk Full Cream 500 ml', 'Milk Toned 500 ml']);
    const oneLitre = await get({ query: 'toned 1 l' });
    expect(oneLitre.body.data.map((p: { packLabel: string }) => p.packLabel)).toEqual(['1 L']);
  });

  it('filters by category and combines with search', async () => {
    const dairy = await get({ category: 'dairy' });
    expect(dairy.body.total).toBe(8);
    expect(dairy.body.data.every((p: { category: string }) => p.category === 'dairy')).toBe(true);
    expect((await get({ category: 'dairy', query: 'egg' })).body.total).toBe(2);
    expect((await get({ category: 'bakery', query: 'milk' })).body.total).toBe(0);
  });

  it('is safe against regex metacharacters', async () => {
    for (const q of ['(', '.*', '[a-', '\\', 'a|b', '$^']) {
      const res = await get({ query: q });
      expect(res.status).toBe(200);
    }
    expect((await get({ query: '.*' })).body.total).toBe(0);
  });

  it('returns no results for an unmatched search', async () => {
    const res = await get({ query: 'zzzz' });
    expect(res.body).toMatchObject({ data: [], total: 0, totalPages: 0 });
  });

  it.each([
    { page: 0 },
    { page: -1 },
    { page: 'x' },
    { page: 1.5 },
    { limit: 0 },
    { limit: 51 },
    { limit: -5 },
    { limit: 'abc' },
    { category: 'electronics' },
    { query: 'x'.repeat(65) },
  ])('rejects invalid params %j', async (params) => {
    const res = await get(params);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cannot be used for operator injection', async () => {
    // Express's simple query parser never builds objects, so `query[$ne]` is just an unknown
    // key and is ignored: no filter is applied, nothing reaches Mongo as an operator.
    const res = await request(app).get('/api/v1/products?query[$ne]=x');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(40);
    expect((await request(app).get('/api/v1/products?category[$gt]=')).body.total).toBe(40);
    // Repeated params become an array, which validation rejects.
    expect((await request(app).get('/api/v1/products?query=a&query=b')).status).toBe(400);
    expect((await request(app).get('/api/v1/products?category=dairy&category=bakery')).status).toBe(
      400,
    );
  });
});

describe('tokenise', () => {
  it('splits digit/letter boundaries and caps the token count', () => {
    expect(tokenise('Milk 500ml')).toEqual(['milk', '500', 'ml']);
    expect(tokenise('  a   b ')).toEqual(['a', 'b']);
    expect(tokenise('1 2 3 4 5 6 7 8')).toHaveLength(6);
  });
});
