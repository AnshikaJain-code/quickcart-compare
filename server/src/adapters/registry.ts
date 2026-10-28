import { LiveProviderAdapterTemplate } from './LiveProviderAdapterTemplate';
import { SeededDbAdapter } from './SeededDbAdapter';
import type { ProviderAdapter, ProviderRef } from './types';

export interface AdapterRegistry {
  adapterFor(provider: ProviderRef): ProviderAdapter;
}

export type LiveAdapterFactory = (provider: ProviderRef) => ProviderAdapter;

/**
 * Chooses the adapter for a provider:
 *  1. an explicit override registered for the provider's slug (used by tests and special cases);
 *  2. otherwise by dataSourceType: SEED and MANUAL read stored data; AUTHORISED_API uses the live
 *     factory if one was set, else the NotConfigured template.
 */
export class DefaultAdapterRegistry implements AdapterRegistry {
  private readonly overrides = new Map<string, ProviderAdapter>();
  private liveFactory: LiveAdapterFactory | null = null;

  register(slug: string, adapter: ProviderAdapter): this {
    this.overrides.set(slug, adapter);
    return this;
  }

  setLiveFactory(factory: LiveAdapterFactory): this {
    this.liveFactory = factory;
    return this;
  }

  adapterFor(provider: ProviderRef): ProviderAdapter {
    const override = this.overrides.get(provider.slug);
    if (override) return override;
    if (provider.dataSourceType === 'AUTHORISED_API') {
      return this.liveFactory
        ? this.liveFactory(provider)
        : new LiveProviderAdapterTemplate(provider);
    }
    return new SeededDbAdapter(provider);
  }
}
