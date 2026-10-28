import { Provider, ServiceArea, type Serviceability } from '../models';

export interface ProviderCoverage {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  officialBaseUrl: string | null;
  dataSourceType: string;
  serviceability: Serviceability;
  verifiedAt: Date | null;
}

export interface Coverage {
  providers: ProviderCoverage[];
  isSampleData: boolean;
}

/**
 * Coverage of every ACTIVE provider for a PIN code.
 * A missing service-area row means UNKNOWN, never "not served" (absence of data is not data).
 */
export async function getCoverage(pinCode: string): Promise<Coverage> {
  const providers = await Provider.find({ active: true }).sort({ name: 1 }).lean();
  const areas = await ServiceArea.find({
    pinCode,
    providerId: { $in: providers.map((p) => p._id) },
  }).lean();
  const byProvider = new Map(areas.map((a) => [String(a.providerId), a]));

  return {
    providers: providers.map((p) => {
      const area = byProvider.get(String(p._id));
      return {
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        logoUrl: p.logoUrl ?? null,
        officialBaseUrl: p.officialBaseUrl ?? null,
        dataSourceType: p.dataSourceType,
        serviceability: (area?.status ?? 'UNKNOWN') as Serviceability,
        verifiedAt: area?.verifiedAt ?? null,
      };
    }),
    isSampleData: providers.some((p) => p.dataSourceType === 'SEED'),
  };
}

export type PinStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

export interface PinValidation {
  pinCode: string;
  status: PinStatus;
  message: string;
  providers: { available: number; unavailable: number; unknown: number; total: number };
  isSampleData: boolean;
}

/**
 * SUPPORTED   : at least one provider is AVAILABLE.
 * UNSUPPORTED : every provider is explicitly UNAVAILABLE.
 * UNKNOWN     : anything else (no data, or only unknowns and unavailables).
 */
export async function validatePin(pinCode: string): Promise<PinValidation> {
  const { providers, isSampleData } = await getCoverage(pinCode);
  const count = (s: Serviceability) => providers.filter((p) => p.serviceability === s).length;
  const counts = {
    available: count('AVAILABLE'),
    unavailable: count('UNAVAILABLE'),
    unknown: count('UNKNOWN'),
    total: providers.length,
  };

  let status: PinStatus;
  let message: string;
  if (counts.available > 0) {
    status = 'SUPPORTED';
    message = `${counts.available} of ${counts.total} providers deliver to ${pinCode}.`;
  } else if (counts.total > 0 && counts.unavailable === counts.total) {
    status = 'UNSUPPORTED';
    message = `No provider in this prototype delivers to ${pinCode}.`;
  } else {
    status = 'UNKNOWN';
    message = `We have no confirmed delivery data for ${pinCode} yet. That does not mean it is not served.`;
  }

  return { pinCode, status, message, providers: counts, isSampleData };
}
