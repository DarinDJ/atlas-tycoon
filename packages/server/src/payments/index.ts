/**
 * Store abstraction. Products are data; providers are adapters. Everything here runs in TEST MODE:
 * no real charges are made until keys are configured and the TODOs are completed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Storage } from '../storage/db.js';

export interface Product {
  sku: string;
  kind: 'map' | 'cosmetic' | 'pass';
  name: string;
  description: string;
  /** Minor units (paise / cents). */
  priceInr: number;
  priceUsd: number;
  /** For map packs: the map ids unlocked. For cosmetics: the item ids. */
  grants: string[];
}

export const PRODUCTS: Product[] = [
  {
    sku: 'map-usa',
    kind: 'map',
    name: 'USA – Cities map',
    description: 'Play across 22 American cities.',
    priceInr: 9900,
    priceUsd: 199,
    grants: ['usa-cities'],
  },
  {
    sku: 'map-uk',
    kind: 'map',
    name: 'UK – Cities map',
    description: 'From Aberdeen to London.',
    priceInr: 9900,
    priceUsd: 199,
    grants: ['uk-cities'],
  },
  {
    sku: 'map-bundle',
    kind: 'map',
    name: 'World Traveller bundle',
    description: 'All premium maps, now and future.',
    priceInr: 19900,
    priceUsd: 399,
    grants: ['usa-cities', 'uk-cities', 'map-all'],
  },
  {
    sku: 'cosmetic-royal',
    kind: 'cosmetic',
    name: 'Royal pawn set',
    description: 'Crowned, neon and gold pawn finishes plus gold dice.',
    priceInr: 4900,
    priceUsd: 99,
    grants: ['pawn-crown', 'pawn-neon', 'pawn-gold', 'dice-gold'],
  },
  {
    sku: 'theme-midnight',
    kind: 'cosmetic',
    name: 'Midnight board theme',
    description: 'A dark, neon board for late-night games.',
    priceInr: 2900,
    priceUsd: 49,
    grants: ['theme-midnight'],
  },
  {
    sku: 'supporter-pass',
    kind: 'pass',
    name: 'Supporter pass (no ads)',
    description: 'Remove all ads for a year and get a supporter badge.',
    priceInr: 14900,
    priceUsd: 299,
    grants: ['no-ads', 'badge-supporter'],
  },
];

export function productBySku(sku: string): Product | undefined {
  return PRODUCTS.find((p) => p.sku === sku);
}

export interface CheckoutSession {
  provider: 'stripe' | 'razorpay' | 'dev';
  id: string;
  /** Where the client should go to pay (dev mode: an internal URL that completes instantly). */
  url: string;
}

export interface PaymentProvider {
  readonly name: 'stripe' | 'razorpay';
  isConfigured(): boolean;
  createCheckout(args: {
    product: Product;
    clientId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession>;
  /** Verify a webhook and return the purchase it describes, or null if unverified/irrelevant. */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): { purchaseId: string; clientId: string; sku: string; status: 'paid' | 'failed' } | null;
}

/** Stripe Checkout adapter (stub). TODO: `npm i stripe` and call stripe.checkout.sessions.create. */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  constructor(
    private secretKey: string,
    private webhookSecret: string,
  ) {}
  isConfigured(): boolean {
    return !!this.secretKey && !!this.webhookSecret;
  }
  async createCheckout({
    product,
    clientId,
    successUrl,
  }: {
    product: Product;
    clientId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    // TODO(real-stripe): replace with stripe.checkout.sessions.create({ mode:'payment', line_items:[...], metadata:{clientId, sku}, success_url, cancel_url })
    const id = `cs_test_${clientId.slice(0, 6)}_${product.sku}_${Date.now()}`;
    return { provider: 'stripe', id, url: `${successUrl}?session_id=${id}` };
  }
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    // Stripe signs with HMAC-SHA256 over `${t}.${rawBody}`; this mirrors that scheme for the stub.
    const sig = String(headers['stripe-signature'] ?? '');
    const m = /t=(\d+),v1=([a-f0-9]+)/.exec(sig);
    if (!m) return null;
    const expected = createHmac('sha256', this.webhookSecret).update(`${m[1]}.${rawBody}`).digest('hex');
    if (!safeEqual(expected, m[2]!)) return null;
    const body = JSON.parse(rawBody) as {
      type: string;
      data: { object: { id: string; metadata: { clientId: string; sku: string } } };
    };
    if (body.type !== 'checkout.session.completed') return null;
    return {
      purchaseId: body.data.object.id,
      clientId: body.data.object.metadata.clientId,
      sku: body.data.object.metadata.sku,
      status: 'paid' as const,
    };
  }
}

/** Razorpay adapter (stub). TODO: `npm i razorpay` and create an order / payment link. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  constructor(
    private keyId: string,
    private keySecret: string,
    private webhookSecret: string,
  ) {}
  isConfigured(): boolean {
    return !!this.keyId && !!this.keySecret;
  }
  async createCheckout({
    product,
    clientId,
    successUrl,
  }: {
    product: Product;
    clientId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSession> {
    // TODO(real-razorpay): razorpay.paymentLink.create({ amount: product.priceInr, currency:'INR', notes:{clientId, sku}, callback_url })
    const id = `plink_test_${clientId.slice(0, 6)}_${product.sku}_${Date.now()}`;
    return { provider: 'razorpay', id, url: `${successUrl}?razorpay_payment_link_id=${id}` };
  }
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const sig = String(headers['x-razorpay-signature'] ?? '');
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!sig || !safeEqual(expected, sig)) return null;
    const body = JSON.parse(rawBody) as {
      event: string;
      payload: { payment_link?: { entity: { id: string; notes: { clientId: string; sku: string } } } };
    };
    if (body.event !== 'payment_link.paid' || !body.payload.payment_link) return null;
    const e = body.payload.payment_link.entity;
    return { purchaseId: e.id, clientId: e.notes.clientId, sku: e.notes.sku, status: 'paid' as const };
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export class Store {
  constructor(
    private storage: Storage,
    private providers: PaymentProvider[],
    private devMode: boolean,
  ) {}

  availableProviders(): string[] {
    const list: string[] = this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
    if (this.devMode) list.push('dev');
    return list;
  }

  async checkout(
    sku: string,
    providerName: string,
    clientId: string,
    publicUrl: string,
  ): Promise<CheckoutSession> {
    const product = productBySku(sku);
    if (!product) throw new Error('UNKNOWN_SKU');
    const successUrl = `${publicUrl}/store/success`;
    const cancelUrl = `${publicUrl}/store`;
    if (providerName === 'dev') {
      if (!this.devMode) throw new Error('DEV_MODE_OFF');
      const id = `dev_${Date.now()}`;
      this.storage.recordPurchase({
        id,
        clientId,
        sku,
        provider: 'dev',
        amount: product.priceInr,
        currency: 'INR',
        status: 'created',
      });
      return {
        provider: 'dev',
        id,
        url: `/api/store/dev-complete?sku=${encodeURIComponent(sku)}&clientId=${encodeURIComponent(clientId)}&purchase=${id}`,
      };
    }
    const provider = this.providers.find((p) => p.name === providerName && p.isConfigured());
    if (!provider) throw new Error('PROVIDER_UNAVAILABLE');
    const session = await provider.createCheckout({ product, clientId, successUrl, cancelUrl });
    this.storage.recordPurchase({
      id: session.id,
      clientId,
      sku,
      provider: provider.name,
      amount: provider.name === 'stripe' ? product.priceUsd : product.priceInr,
      currency: provider.name === 'stripe' ? 'USD' : 'INR',
      status: 'created',
    });
    return session;
  }

  /** Grant everything a product unlocks. Idempotent. */
  fulfil(clientId: string, sku: string, purchaseId: string, source: string): void {
    const product = productBySku(sku);
    if (!product) return;
    for (const g of product.grants) this.storage.grantEntitlement(clientId, g, source);
    this.storage.grantEntitlement(clientId, sku, source);
    this.storage.recordPurchase({
      id: purchaseId,
      clientId,
      sku,
      provider: source,
      amount: 0,
      currency: '',
      status: 'paid',
    });
  }

  handleWebhook(
    providerName: string,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) return false;
    const r = provider.parseWebhook(rawBody, headers);
    if (!r) return false;
    if (r.status === 'paid') this.fulfil(r.clientId, r.sku, r.purchaseId, provider.name);
    return true;
  }

  entitlements(clientId: string): string[] {
    return this.storage.entitlements(clientId);
  }

  canPlayMap(clientId: string, mapId: string, premium: boolean | undefined): boolean {
    if (!premium) return true;
    const ents = this.entitlements(clientId);
    return ents.includes(mapId) || ents.includes('map-all');
  }
}
