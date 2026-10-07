# TODO / known gaps

## Engine & bots
- [ ] Bot trading is conservative: ~13% of 4-player medium games hit the 600-turn cap. Teach hard bots to broker 2-for-1 set trades and to sell off dead-weight properties.
- [ ] Optional house rule: "no auctions on bankruptcy" is implemented; "property for free parking" is not.

## Server
- [ ] Redis adapter for multi-process socket.io (documented, not wired).
- [ ] Real Stripe/Razorpay SDK calls (stubs in `packages/server/src/payments`).
- [ ] Persist reports from `chat:report` to a table instead of logs.

## Web
- [ ] Real city artwork (slots exist: `tile.image`).
- [ ] More languages: Tamil, Bengali, Marathi, Telugu (string tables ready in `packages/web/src/i18n`).
