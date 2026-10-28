/**
 * SAMPLE dataset. Everything here is invented for the prototype:
 * fictional providers (Demo Provider A/B/C), fictional brands and made-up prices.
 * Prices are explicit per provider so totals can be checked by hand.
 * See docs/data-policy.md.
 */
import type { Category, QuantityUnit } from '../models/enums';

export type ProviderKey = 'A' | 'B' | 'C';
export const PROVIDER_KEYS: ProviderKey[] = ['A', 'B', 'C'];

export interface ProviderSeed {
  key: ProviderKey;
  name: string;
  slug: string;
  officialBaseUrl: string | null;
}

export const PROVIDERS: ProviderSeed[] = [
  {
    key: 'A',
    name: 'Demo Provider A',
    slug: 'demo-provider-a',
    officialBaseUrl: 'https://example.com/demo-provider-a',
  },
  {
    key: 'B',
    name: 'Demo Provider B',
    slug: 'demo-provider-b',
    officialBaseUrl: 'https://example.com/demo-provider-b',
  },
  { key: 'C', name: 'Demo Provider C', slug: 'demo-provider-c', officialBaseUrl: null },
];

export interface ProductSeed {
  key: string;
  name: string;
  brand: string;
  category: Category;
  variant: string;
  qty: number;
  unit: QuantityUnit;
  /** Price in INR for [A, B, C]. null = this provider does not list the product. */
  prices: [number | null, number | null, number | null];
  gtin?: string;
}

const MF = 'Meadow Fresh';
const SF = 'Sunrise Farms';
const GC = 'Golden Crust';
const HG = 'Harvest Gold';
const SL = 'Sweet Leaf';
const PP = 'Pure Press';
const CC = 'Crunchy Corner';
const FB = 'Fresh Basket';
const SH = 'Sparkle Home';

export const PRODUCTS: ProductSeed[] = [
  // dairy
  {
    key: 'milk-tt-500',
    name: 'Milk',
    brand: MF,
    category: 'dairy',
    variant: 'Toned',
    qty: 500,
    unit: 'ml',
    prices: [27, 28, 26],
    gtin: '2000000000015',
  },
  {
    key: 'milk-tt-1000',
    name: 'Milk',
    brand: MF,
    category: 'dairy',
    variant: 'Toned',
    qty: 1,
    unit: 'l',
    prices: [52, 54, 51],
    gtin: '2000000000022',
  },
  {
    key: 'milk-fc-500',
    name: 'Milk',
    brand: MF,
    category: 'dairy',
    variant: 'Full Cream',
    qty: 500,
    unit: 'ml',
    prices: [33, 34, 31],
  },
  {
    key: 'curd-400',
    name: 'Set Curd',
    brand: MF,
    category: 'dairy',
    variant: '',
    qty: 400,
    unit: 'g',
    prices: [38, 40, 37],
  },
  {
    key: 'butter-100',
    name: 'Butter',
    brand: MF,
    category: 'dairy',
    variant: 'Salted',
    qty: 100,
    unit: 'g',
    prices: [58, 60, 59],
  },
  {
    key: 'paneer-200',
    name: 'Paneer',
    brand: MF,
    category: 'dairy',
    variant: 'Fresh',
    qty: 200,
    unit: 'g',
    prices: [88, 85, 90],
  },
  {
    key: 'eggs-6',
    name: 'Eggs',
    brand: SF,
    category: 'dairy',
    variant: 'White',
    qty: 6,
    unit: 'pcs',
    prices: [48, 50, 47],
  },
  {
    key: 'eggs-12',
    name: 'Eggs',
    brand: SF,
    category: 'dairy',
    variant: 'White',
    qty: 12,
    unit: 'pcs',
    prices: [92, 95, 90],
  },
  // bakery
  {
    key: 'bread-white-400',
    name: 'Sandwich Bread',
    brand: GC,
    category: 'bakery',
    variant: 'White',
    qty: 400,
    unit: 'g',
    prices: [42, 40, 44],
  },
  {
    key: 'bread-brown-400',
    name: 'Sandwich Bread',
    brand: GC,
    category: 'bakery',
    variant: 'Brown',
    qty: 400,
    unit: 'g',
    prices: [48, 47, 50],
  },
  {
    key: 'bun-4',
    name: 'Pav Buns',
    brand: GC,
    category: 'bakery',
    variant: '',
    qty: 4,
    unit: 'pcs',
    prices: [30, null, 32],
  },
  {
    key: 'rusk-200',
    name: 'Rusk',
    brand: GC,
    category: 'bakery',
    variant: 'Wheat',
    qty: 200,
    unit: 'g',
    prices: [45, 44, 46],
  },
  // staples
  {
    key: 'rice-1',
    name: 'Basmati Rice',
    brand: HG,
    category: 'staples',
    variant: '',
    qty: 1,
    unit: 'kg',
    prices: [118, 120, 115],
  },
  {
    key: 'rice-5',
    name: 'Basmati Rice',
    brand: HG,
    category: 'staples',
    variant: '',
    qty: 5,
    unit: 'kg',
    prices: [560, 575, 548],
  },
  {
    key: 'atta-5',
    name: 'Atta',
    brand: HG,
    category: 'staples',
    variant: 'Whole Wheat',
    qty: 5,
    unit: 'kg',
    prices: [245, 250, 240],
  },
  {
    key: 'atta-10',
    name: 'Atta',
    brand: HG,
    category: 'staples',
    variant: 'Whole Wheat',
    qty: 10,
    unit: 'kg',
    prices: [478, null, 470],
  },
  {
    key: 'dal-1',
    name: 'Toor Dal',
    brand: HG,
    category: 'staples',
    variant: '',
    qty: 1,
    unit: 'kg',
    prices: [168, 165, 172],
  },
  {
    key: 'sugar-1',
    name: 'Sugar',
    brand: SL,
    category: 'staples',
    variant: 'Refined',
    qty: 1,
    unit: 'kg',
    prices: [52, 51, 54],
  },
  {
    key: 'salt-1',
    name: 'Salt',
    brand: SL,
    category: 'staples',
    variant: 'Iodised',
    qty: 1,
    unit: 'kg',
    prices: [24, 25, 24],
  },
  {
    key: 'oil-500',
    name: 'Sunflower Oil',
    brand: PP,
    category: 'staples',
    variant: '',
    qty: 500,
    unit: 'ml',
    prices: [92, 95, 90],
  },
  {
    key: 'oil-1000',
    name: 'Sunflower Oil',
    brand: PP,
    category: 'staples',
    variant: '',
    qty: 1,
    unit: 'l',
    prices: [178, 182, 175],
  },
  // snacks
  {
    key: 'chips-classic-52',
    name: 'Potato Chips',
    brand: CC,
    category: 'snacks',
    variant: 'Classic Salted',
    qty: 52,
    unit: 'g',
    prices: [20, 20, 20],
  },
  {
    key: 'chips-masala-52',
    name: 'Potato Chips',
    brand: CC,
    category: 'snacks',
    variant: 'Masala',
    qty: 52,
    unit: 'g',
    prices: [20, 20, 22],
  },
  {
    key: 'cookies-oat-150',
    name: 'Oat Cookies',
    brand: CC,
    category: 'snacks',
    variant: '',
    qty: 150,
    unit: 'g',
    prices: [45, null, 48],
  },
  {
    key: 'namkeen-200',
    name: 'Mixture Namkeen',
    brand: CC,
    category: 'snacks',
    variant: '',
    qty: 200,
    unit: 'g',
    prices: [55, 52, 56],
  },
  {
    key: 'chocolate-50',
    name: 'Milk Chocolate Bar',
    brand: 'Cocoa Lane',
    category: 'snacks',
    variant: '',
    qty: 50,
    unit: 'g',
    prices: [50, 50, 52],
  },
  {
    key: 'biscuit-glucose-200',
    name: 'Glucose Biscuits',
    brand: GC,
    category: 'snacks',
    variant: '',
    qty: 200,
    unit: 'g',
    prices: [25, 25, 26],
  },
  // beverages
  {
    key: 'tea-250',
    name: 'Tea',
    brand: 'Chai Valley',
    category: 'beverages',
    variant: 'Assam',
    qty: 250,
    unit: 'g',
    prices: [135, 138, 132],
  },
  {
    key: 'coffee-100',
    name: 'Instant Coffee',
    brand: 'Brew House',
    category: 'beverages',
    variant: '',
    qty: 100,
    unit: 'g',
    prices: [295, 290, 300],
  },
  {
    key: 'juice-orange-1000',
    name: 'Orange Juice',
    brand: 'Orchard Press',
    category: 'beverages',
    variant: '',
    qty: 1,
    unit: 'l',
    prices: [110, 108, 115],
  },
  {
    key: 'cola-750',
    name: 'Cola',
    brand: 'Fizz Works',
    category: 'beverages',
    variant: '',
    qty: 750,
    unit: 'ml',
    prices: [40, 40, 42],
  },
  {
    key: 'cola-2250',
    name: 'Cola',
    brand: 'Fizz Works',
    category: 'beverages',
    variant: '',
    qty: 2.25,
    unit: 'l',
    prices: [95, 98, 94],
  },
  {
    key: 'water-1000',
    name: 'Drinking Water',
    brand: 'Clearspring',
    category: 'beverages',
    variant: 'Packaged',
    qty: 1,
    unit: 'l',
    prices: [20, 20, 20],
  },
  // produce
  {
    key: 'tomato-500',
    name: 'Tomato',
    brand: FB,
    category: 'produce',
    variant: 'Hybrid',
    qty: 500,
    unit: 'g',
    prices: [24, 22, 25],
  },
  {
    key: 'onion-1',
    name: 'Onion',
    brand: FB,
    category: 'produce',
    variant: '',
    qty: 1,
    unit: 'kg',
    prices: [42, 40, 44],
  },
  {
    key: 'potato-1',
    name: 'Potato',
    brand: FB,
    category: 'produce',
    variant: '',
    qty: 1,
    unit: 'kg',
    prices: [36, 35, 38],
  },
  {
    key: 'banana-6',
    name: 'Banana',
    brand: FB,
    category: 'produce',
    variant: 'Robusta',
    qty: 6,
    unit: 'pcs',
    prices: [40, 42, 38],
  },
  {
    key: 'spinach-250',
    name: 'Spinach',
    brand: FB,
    category: 'produce',
    variant: 'Bunch',
    qty: 250,
    unit: 'g',
    prices: [20, 22, null],
  },
  // household
  {
    key: 'detergent-1',
    name: 'Detergent Powder',
    brand: SH,
    category: 'household',
    variant: '',
    qty: 1,
    unit: 'kg',
    prices: [130, 125, 135],
  },
  {
    key: 'dishwash-500',
    name: 'Dishwash Liquid',
    brand: SH,
    category: 'household',
    variant: '',
    qty: 500,
    unit: 'ml',
    prices: [105, 110, 102],
  },
];

/** Listings that differ from the plain "exact match" pattern. Key: `${provider}:${productKey}`. */
export interface ListingOverride {
  title?: string;
  brand?: string;
  matchStatus: 'LIKELY' | 'SUBSTITUTE';
  matchConfidence: number;
}

export const LISTING_OVERRIDES: Record<string, ListingOverride> = {
  // A different brand offered as a stand-in. Only used if the shopper allows substitutes.
  'C:milk-fc-500': {
    title: 'Daily Value Full Cream Milk 500 ml',
    brand: 'Daily Value',
    matchStatus: 'SUBSTITUTE',
    matchConfidence: 0.6,
  },
  // Variant (salted) is not stated, so the match cannot be confirmed; needs admin review.
  'C:butter-100': {
    title: 'MEADOW FRESH BUTTER 100G',
    matchStatus: 'LIKELY',
    matchConfidence: 0.8,
  },
};

/** Look-alike listings with NO canonical product (different pack sizes / bundles). */
export interface ExtraListing {
  provider: ProviderKey;
  title: string;
  brand: string;
  packSize: string;
  price: number;
}

export const EXTRA_LISTINGS: ExtraListing[] = [
  {
    provider: 'A',
    title: 'Meadow Fresh Toned Milk 250 ml',
    brand: MF,
    packSize: '250 ml',
    price: 15,
  },
  {
    provider: 'B',
    title: 'Brown Bread - (Golden Crust) 600g',
    brand: GC,
    packSize: '600g',
    price: 66,
  },
  {
    provider: 'C',
    title: 'MEADOW FRESH MILK TONED 2 x 500 ML (PACK OF 2)',
    brand: MF,
    packSize: '2 x 500 ml',
    price: 52,
  },
];

export type CoverageStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

/** PIN coverage. 999999: nobody serves it. B/110002: UNKNOWN. C/110003: not served. 400001 has no rows. */
export const COVERAGE: { provider: ProviderKey; pinCode: string; status: CoverageStatus }[] = [
  { provider: 'A', pinCode: '110001', status: 'AVAILABLE' },
  { provider: 'A', pinCode: '110002', status: 'AVAILABLE' },
  { provider: 'A', pinCode: '110003', status: 'AVAILABLE' },
  { provider: 'A', pinCode: '999999', status: 'UNAVAILABLE' },
  { provider: 'B', pinCode: '110001', status: 'AVAILABLE' },
  { provider: 'B', pinCode: '110002', status: 'UNKNOWN' },
  { provider: 'B', pinCode: '110003', status: 'AVAILABLE' },
  { provider: 'B', pinCode: '999999', status: 'UNAVAILABLE' },
  { provider: 'C', pinCode: '110001', status: 'AVAILABLE' },
  { provider: 'C', pinCode: '110002', status: 'AVAILABLE' },
  { provider: 'C', pinCode: '110003', status: 'UNAVAILABLE' },
  { provider: 'C', pinCode: '999999', status: 'UNAVAILABLE' },
];

export interface DiscountSeed {
  code: string | null;
  label: string;
  type: 'FLAT' | 'PERCENT';
  value: number;
  minOrderValue: number | null;
  maxDiscount: number | null;
}

export interface QuoteSeed {
  tag: string;
  provider: ProviderKey;
  pinCode: string;
  sourceStatus: 'SAMPLE' | 'VERIFIED' | 'STALE';
  /** Minutes before "now" that this snapshot was retrieved. */
  ageMinutes: number;
  /** Minutes the snapshot stays valid after retrieval. */
  ttlMinutes: number;
  deliveryFee: number | null;
  platformFee: number | null;
  smallOrderFee: number | null;
  otherFees: number | null;
  taxes: number | null;
  discounts: DiscountSeed[];
  etaMinutes: number | null;
  /** Product keys that are out of stock in this snapshot. */
  outOfStock: string[];
}

const DAY = 1440;

export const QUOTES: QuoteSeed[] = [
  // Older snapshot for A/110001. The newer one below must win ("latest snapshot").
  {
    tag: 'older',
    provider: 'A',
    pinCode: '110001',
    sourceStatus: 'SAMPLE',
    ageMinutes: DAY + 60,
    ttlMinutes: DAY,
    deliveryFee: 40,
    platformFee: 3,
    smallOrderFee: 0,
    otherFees: 0,
    taxes: 0,
    discounts: [],
    etaMinutes: 14,
    outOfStock: [],
  },
  {
    tag: 'latest',
    provider: 'A',
    pinCode: '110001',
    sourceStatus: 'SAMPLE',
    ageMinutes: 10,
    ttlMinutes: DAY,
    deliveryFee: 25,
    platformFee: 3,
    smallOrderFee: 0,
    otherFees: 0,
    taxes: 0,
    discounts: [
      {
        code: 'DEMO30',
        label: 'Rs 30 off on orders of Rs 399 or more',
        type: 'FLAT',
        value: 30,
        minOrderValue: 399,
        maxDiscount: null,
      },
    ],
    etaMinutes: 12,
    outOfStock: ['eggs-6'],
  },
  // The one VERIFIED example (shows the status exists; the data is still invented).
  {
    tag: 'latest',
    provider: 'A',
    pinCode: '110002',
    sourceStatus: 'VERIFIED',
    ageMinutes: 30,
    ttlMinutes: DAY,
    deliveryFee: 20,
    platformFee: 3,
    smallOrderFee: 0,
    otherFees: 0,
    taxes: 0,
    discounts: [],
    etaMinutes: 15,
    outOfStock: [],
  },
  // Unknown ETA.
  {
    tag: 'latest',
    provider: 'A',
    pinCode: '110003',
    sourceStatus: 'SAMPLE',
    ageMinutes: 15,
    ttlMinutes: DAY,
    deliveryFee: 30,
    platformFee: 3,
    smallOrderFee: 0,
    otherFees: 0,
    taxes: 0,
    discounts: [],
    etaMinutes: null,
    outOfStock: [],
  },
  {
    tag: 'latest',
    provider: 'B',
    pinCode: '110001',
    sourceStatus: 'SAMPLE',
    ageMinutes: 12,
    ttlMinutes: DAY,
    deliveryFee: 0,
    platformFee: 10,
    smallOrderFee: 20,
    otherFees: 0,
    taxes: 0,
    discounts: [
      {
        code: 'DEMO10',
        label: '10% off (max Rs 40) on orders of Rs 300 or more',
        type: 'PERCENT',
        value: 10,
        minOrderValue: 300,
        maxDiscount: 40,
      },
    ],
    etaMinutes: 20,
    outOfStock: [],
  },
  // STALE: retrieved 3 days ago, expired 2 days ago.
  {
    tag: 'latest',
    provider: 'B',
    pinCode: '110003',
    sourceStatus: 'STALE',
    ageMinutes: 3 * DAY,
    ttlMinutes: DAY,
    deliveryFee: 0,
    platformFee: 10,
    smallOrderFee: 20,
    otherFees: 0,
    taxes: 0,
    discounts: [],
    etaMinutes: 25,
    outOfStock: [],
  },
  // Unknown platform fee (null), which is different from a confirmed 0.
  {
    tag: 'latest',
    provider: 'C',
    pinCode: '110001',
    sourceStatus: 'SAMPLE',
    ageMinutes: 8,
    ttlMinutes: DAY,
    deliveryFee: 35,
    platformFee: null,
    smallOrderFee: 0,
    otherFees: 0,
    taxes: 0,
    discounts: [],
    etaMinutes: 9,
    outOfStock: [],
  },
  {
    tag: 'latest',
    provider: 'C',
    pinCode: '110002',
    sourceStatus: 'SAMPLE',
    ageMinutes: 20,
    ttlMinutes: DAY,
    deliveryFee: 30,
    platformFee: 0,
    smallOrderFee: 15,
    otherFees: 5,
    taxes: 0,
    discounts: [
      {
        code: null,
        label: 'Rs 20 off on orders of Rs 250 or more',
        type: 'FLAT',
        value: 20,
        minOrderValue: 250,
        maxDiscount: null,
      },
    ],
    etaMinutes: 11,
    outOfStock: ['bread-white-400'],
  },
];

export const CHECKOUT_URLS: Record<ProviderKey, string | null> = {
  A: 'https://example.com/demo-provider-a/checkout',
  B: 'https://example.com/demo-provider-b/checkout',
  C: null,
};
