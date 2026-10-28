import request from 'supertest';
import type { Express } from 'express';
import type {
  RankedProviderResult,
  ProviderResult,
  CompareResponse,
} from '../services/compareTypes';

export const ENV = { CLIENT_ORIGIN: 'http://localhost:5173' };

export const postCompare = (app: Express, body: unknown) =>
  request(app)
    .post('/api/v1/compare')
    .send(body as object);

export const compareOk = async (app: Express, body: unknown): Promise<CompareResponse> => {
  const res = await postCompare(app, body);
  if (res.status !== 200)
    throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body as CompareResponse;
};

export const byName = <T extends ProviderResult>(list: T[], name: string): T => {
  const found = list.find((r) => r.name === name);
  if (!found) throw new Error(`no ${name} in [${list.map((r) => r.name).join(', ')}]`);
  return found;
};

export const order = (list: { name: string }[]) =>
  list.map((r) => r.name.replace('Demo Provider ', ''));
export const ranks = (list: RankedProviderResult[]) => list.map((r) => r.rank);
export const codes = (res: CompareResponse) => res.warnings.map((w) => w.code);
