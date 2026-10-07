import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useT } from '../i18n';
import { api, type Product } from '../lib/api';
import { loadEntitlements, useEntitlements } from '../lib/useEntitlements';
import { useGame } from '../store/useGame';

/** Store: map packs, cosmetics, supporter pass. Payments run through server adapters (test mode). */
export default function Store() {
  const t = useT();
  const [params] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const ents = useEntitlements();
  const toast = useGame((s) => s.toast);
  const purchased = params.get('purchased');

  useEffect(() => {
    void api
      .products()
      .then((r) => {
        setProducts(r.products);
        setProviders(r.providers);
      })
      .catch(() => toast('error', t('err.generic')));
    void loadEntitlements(true);
  }, [toast, t]);

  const buy = async (sku: string, provider: string) => {
    setBusy(sku);
    try {
      const s = await api.checkout(sku, provider);
      location.href = s.url.startsWith('http') ? s.url : `${import.meta.env.VITE_API_URL ?? ''}${s.url}`;
    } catch {
      toast('error', t('err.generic'));
      setBusy(null);
    }
  };

  const owned = (p: Product) => ents.includes(p.sku) || p.grants.every((g) => ents.includes(g));
  const section = (kind: Product['kind'], title: string) => (
    <section key={kind}>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {products
          .filter((p) => p.kind === kind)
          .map((p) => (
            <div key={p.sku} className="panel flex flex-col gap-2 p-4" data-testid={`product-${p.sku}`}>
              <div className="text-base font-bold">{p.name}</div>
              <p className="flex-1 text-sm opacity-70">{p.description}</p>
              <div className="flex items-center justify-between">
                <span className="font-bold tabular-nums">
                  ₹{(p.priceInr / 100).toFixed(0)}{' '}
                  <span className="text-xs opacity-60">/ ${(p.priceUsd / 100).toFixed(2)}</span>
                </span>
                {owned(p) ? (
                  <span className="rounded-full bg-leaf/15 px-3 py-1 text-sm font-bold text-leaf">
                    ✓ {t('store.owned')}
                  </span>
                ) : (
                  <div className="flex gap-1">
                    {providers.includes('razorpay') && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!!busy}
                        onClick={() => void buy(p.sku, 'razorpay')}
                      >
                        {t('store.buy')} (UPI)
                      </button>
                    )}
                    {providers.includes('stripe') && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={!!busy}
                        onClick={() => void buy(p.sku, 'stripe')}
                      >
                        {t('store.buy')} (card)
                      </button>
                    )}
                    {providers.includes('dev') && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!!busy}
                        onClick={() => void buy(p.sku, 'dev')}
                        data-testid={`buy-${p.sku}`}
                      >
                        {t('store.buy')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>
    </section>
  );

  return (
    <main
      id="main"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-[calc(var(--safe-top)+1rem)] pb-16"
    >
      <nav className="text-sm">
        <Link to="/" className="underline opacity-70">
          ← {t('app.back')}
        </Link>
      </nav>
      <h1 className="text-2xl font-black">🛍️ {t('store.title')}</h1>
      {purchased && (
        <div className="rounded-xl bg-leaf/15 p-3 text-sm font-semibold text-leaf">{t('store.thanks')}</div>
      )}
      {providers.includes('dev') && (
        <p className="rounded-xl bg-yellow-100 p-2 text-xs">{t('store.testMode')}</p>
      )}
      {section('map', t('store.maps'))}
      {section('cosmetic', t('store.cosmetics'))}
      {section('pass', t('store.pass'))}
    </main>
  );
}
