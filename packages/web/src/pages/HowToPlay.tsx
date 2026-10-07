import { Link } from 'react-router-dom';
import { BRAND } from '../config/brand';
import { useT } from '../i18n';

export default function HowToPlay() {
  const t = useT();
  return (
    <main id="main" className="prose prose-sm mx-auto max-w-2xl px-4 pt-[calc(var(--safe-top)+1rem)] pb-16">
      <nav className="mb-3 text-sm">
        <Link to="/" className="underline opacity-70">
          ← {t('app.back')}
        </Link>
      </nav>
      <h1 className="text-2xl font-black">📖 {t('home.howToPlay')}</h1>
      <section className="panel mt-3 p-4 text-sm leading-relaxed">
        <h2 className="font-bold">The goal</h2>
        <p>
          Be the last player with money. Buy cities, collect rent, build houses and hotels, and trade smartly.
          In timed mode the richest player wins when the clock runs out.
        </p>
        <h2 className="mt-3 font-bold">Your turn</h2>
        <ol className="list-decimal pl-5">
          <li>Roll two dice and move. Pass Start to collect your salary.</li>
          <li>Land on an unowned city: buy it, or pass and it goes to auction.</li>
          <li>Land on someone's city: pay rent. Rent doubles on a full colour set and rises with houses.</li>
          <li>Doubles give you another roll; three doubles in a row send you to jail.</li>
          <li>End your turn. You can build, mortgage and trade at any time (house rule).</li>
        </ol>
        <h2 className="mt-3 font-bold">Jail</h2>
        <p>Pay the fine, use a jail-free card, or roll doubles. After three failed rolls you pay and move.</p>
        <h2 className="mt-3 font-bold">Running out of cash</h2>
        <p>
          If you cannot pay, sell houses, mortgage properties or trade. If you still cannot pay, you are
          bankrupt and your assets go to the creditor.
        </p>
        <h2 className="mt-3 font-bold">Keyboard</h2>
        <p>
          <kbd>R</kbd> roll · <kbd>B</kbd> buy · <kbd>E</kbd> end turn · <kbd>T</kbd> trade · <kbd>Esc</kbd>{' '}
          close. Tiles are focusable and open their card with Enter.
        </p>
      </section>
      <section id="privacy" className="panel mt-4 p-4 text-sm leading-relaxed">
        <h2 className="font-bold">Privacy</h2>
        <p>
          {BRAND.name} has no accounts. A random id in your browser identifies you so you can rejoin games. We
          store your display name, results and purchases against that id. Chat messages are kept only while a
          room exists. If ads are enabled, they load only after you accept cookies. Contact:{' '}
          {BRAND.supportEmail}.
        </p>
      </section>
    </main>
  );
}
