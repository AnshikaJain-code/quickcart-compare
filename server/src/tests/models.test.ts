import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  AdminAuditLog,
  AdminUser,
  CanonicalProduct,
  Provider,
  ProviderListing,
  Quote,
  ServiceArea,
} from '../models';
import { useTestDb } from './helpers';

useTestDb();

const oid = () => new Types.ObjectId();
const now = new Date();
const validQuote = () => ({
  providerId: oid(),
  pinCode: '110001',
  items: [],
  sourceStatus: 'SAMPLE' as const,
  retrievedAt: now,
  expiresAt: new Date(now.getTime() + 60_000),
});

describe('Provider', () => {
  it('rejects non-https links but accepts null', async () => {
    await expect(
      new Provider({
        name: 'X Provider',
        slug: 'x',
        officialBaseUrl: 'javascript:alert(1)',
      }).validate(),
    ).rejects.toThrow(/https/);
    await expect(
      new Provider({
        name: 'X Provider',
        slug: 'x',
        officialBaseUrl: 'http://plain.example',
      }).validate(),
    ).rejects.toThrow(/https/);
    await expect(
      new Provider({ name: 'X Provider', slug: 'x', officialBaseUrl: null }).validate(),
    ).resolves.toBeUndefined();
  });
  it('rejects bad slugs', async () => {
    await expect(
      new Provider({ name: 'X Provider', slug: 'Bad Slug' }).validate(),
    ).rejects.toThrow();
  });
});

describe('ServiceArea', () => {
  it('validates the PIN format (6 digits, no leading zero)', async () => {
    for (const bad of ['12345', '1234567', '012345', 'abcdef', '']) {
      await expect(
        new ServiceArea({ providerId: oid(), pinCode: bad, status: 'UNKNOWN' }).validate(),
      ).rejects.toThrow();
    }
  });
  it('requires verifiedAt unless the status is UNKNOWN', async () => {
    await expect(
      new ServiceArea({ providerId: oid(), pinCode: '110001', status: 'AVAILABLE' }).validate(),
    ).rejects.toThrow(/verifiedAt/);
    await expect(
      new ServiceArea({ providerId: oid(), pinCode: '110001', status: 'UNKNOWN' }).validate(),
    ).resolves.toBeUndefined();
  });
  it('enforces one row per provider and PIN', async () => {
    await ServiceArea.syncIndexes();
    const providerId = oid();
    await ServiceArea.create({ providerId, pinCode: '110001', status: 'UNKNOWN' });
    await expect(
      ServiceArea.create({ providerId, pinCode: '110001', status: 'UNKNOWN' }),
    ).rejects.toThrow(/duplicate/i);
  });
});

describe('CanonicalProduct', () => {
  const base = {
    name: 'Milk',
    brand: 'B',
    category: 'dairy' as const,
    quantityValue: 500,
    quantityUnit: 'ml' as const,
  };
  it('derives the normalised size and label', async () => {
    const p = new CanonicalProduct({ ...base, quantityValue: 2.25, quantityUnit: 'l' });
    await p.validate();
    expect(p.quantityBase).toBe(2250);
    expect(p.baseUnit).toBe('ml');
    expect(p.packLabel).toBe('2.25 L');
  });
  it('rejects zero or negative sizes and unknown categories/units', async () => {
    await expect(new CanonicalProduct({ ...base, quantityValue: 0 }).validate()).rejects.toThrow();
    await expect(new CanonicalProduct({ ...base, quantityValue: -1 }).validate()).rejects.toThrow();
    await expect(
      new CanonicalProduct({ ...base, category: 'electronics' as never }).validate(),
    ).rejects.toThrow();
    await expect(
      new CanonicalProduct({ ...base, quantityUnit: 'oz' as never }).validate(),
    ).rejects.toThrow();
  });
  it('treats 500 ml and 0.5 l of the same product as duplicates', async () => {
    await CanonicalProduct.syncIndexes();
    await CanonicalProduct.create({ ...base, name: 'Dup' });
    await expect(
      CanonicalProduct.create({ ...base, name: 'Dup', quantityValue: 0.5, quantityUnit: 'l' }),
    ).rejects.toThrow(/duplicate/i);
  });
});

describe('ProviderListing', () => {
  const base = { providerId: oid(), providerProductId: 'p1', title: 'T', packSize: '1 kg' };
  it('needs a canonical product and confidence unless UNMATCHED', async () => {
    await expect(new ProviderListing({ ...base, matchStatus: 'EXACT' }).validate()).rejects.toThrow(
      /canonical/,
    );
    await expect(
      new ProviderListing({ ...base, matchStatus: 'LIKELY', canonicalProductId: oid() }).validate(),
    ).rejects.toThrow(/matchConfidence/);
    await expect(
      new ProviderListing({
        ...base,
        matchStatus: 'EXACT',
        canonicalProductId: oid(),
        matchConfidence: 1,
      }).validate(),
    ).resolves.toBeUndefined();
  });
  it('forbids a canonical product on an UNMATCHED listing', async () => {
    await expect(
      new ProviderListing({
        ...base,
        matchStatus: 'UNMATCHED',
        canonicalProductId: oid(),
      }).validate(),
    ).rejects.toThrow();
    await expect(new ProviderListing({ ...base }).validate()).resolves.toBeUndefined();
  });
  it('limits confidence to 0..1', async () => {
    await expect(
      new ProviderListing({
        ...base,
        matchStatus: 'LIKELY',
        canonicalProductId: oid(),
        matchConfidence: 1.5,
      }).validate(),
    ).rejects.toThrow();
  });
});

describe('Quote', () => {
  it('distinguishes unknown (null) from zero for fees', async () => {
    const q = new Quote({ ...validQuote(), deliveryFee: 0, platformFee: null });
    await q.validate();
    expect(q.deliveryFee).toBe(0);
    expect(q.platformFee).toBeNull();
    expect(new Quote(validQuote()).smallOrderFee).toBeNull(); // default is unknown, not zero
  });
  it('rejects negative, non-finite and over-precise money', async () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.005]) {
      await expect(new Quote({ ...validQuote(), deliveryFee: bad }).validate()).rejects.toThrow();
    }
  });
  it('validates ETA, expiry order, checkout URL and discounts', async () => {
    await expect(new Quote({ ...validQuote(), etaMinutes: 0 }).validate()).rejects.toThrow(
      /etaMinutes/,
    );
    await expect(new Quote({ ...validQuote(), etaMinutes: 12.5 }).validate()).rejects.toThrow(
      /etaMinutes/,
    );
    await expect(
      new Quote({ ...validQuote(), expiresAt: new Date(now.getTime() - 1) }).validate(),
    ).rejects.toThrow(/expiresAt/);
    await expect(
      new Quote({ ...validQuote(), officialCheckoutUrl: 'ftp://x' }).validate(),
    ).rejects.toThrow(/https/);
    await expect(
      new Quote({
        ...validQuote(),
        discounts: [{ label: 'x', type: 'PERCENT', value: 150 }],
      }).validate(),
    ).rejects.toThrow(/100/);
    await expect(
      new Quote({ ...validQuote(), sourceStatus: 'MAYBE' }).validate(),
    ).rejects.toThrow();
  });
  it('is append-only through Mongoose', async () => {
    const q = await Quote.create(validQuote());
    await expect(Quote.updateOne({ _id: q._id }, { deliveryFee: 1 })).rejects.toThrow(
      /append-only/,
    );
    await expect(Quote.findOneAndUpdate({ _id: q._id }, { deliveryFee: 1 })).rejects.toThrow(
      /append-only/,
    );
    await expect(Quote.deleteOne({ _id: q._id })).rejects.toThrow(/append-only/);
    await expect(Quote.deleteMany({})).rejects.toThrow(/append-only/);
    const loaded = await Quote.findById(q._id);
    loaded!.deliveryFee = 5;
    await expect(loaded!.save()).rejects.toThrow(/append-only/);
    expect(await Quote.countDocuments({ _id: q._id })).toBe(1);
  });
});

describe('AdminUser and AdminAuditLog', () => {
  it('lowercases emails, enforces unique email, and hides the hash by default', async () => {
    await AdminUser.syncIndexes();
    await AdminUser.create({
      email: 'Admin@Example.com',
      passwordHash: 'x'.repeat(20),
      role: 'admin',
    });
    const found = await AdminUser.findOne({ email: 'admin@example.com' }).lean();
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty('passwordHash');
    await expect(
      AdminUser.create({ email: 'ADMIN@example.com', passwordHash: 'y', role: 'admin' }),
    ).rejects.toThrow(/duplicate/i);
    await expect(
      new AdminUser({ email: 'not-an-email', passwordHash: 'y', role: 'admin' }).validate(),
    ).rejects.toThrow();
    await expect(
      new AdminUser({ email: 'a@b.co', passwordHash: 'y', role: 'superuser' }).validate(),
    ).rejects.toThrow();
  });
  it('audit log entries cannot be edited or deleted', async () => {
    const e = await AdminAuditLog.create({
      adminId: oid(),
      action: 'x',
      entityType: 'listing',
      entityId: '1',
    });
    await expect(AdminAuditLog.updateOne({ _id: e._id }, { action: 'y' })).rejects.toThrow(
      /append-only/,
    );
    await expect(AdminAuditLog.deleteOne({ _id: e._id })).rejects.toThrow(/append-only/);
  });
});
