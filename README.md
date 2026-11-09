Demo project built to show what I can build. Not a client project.

# OrderSense

**A support agent the brand owns.** Answers order-status, returns and sizing
questions for a Shopify apparel brand from its own knowledge base, looks up
live orders, refuses to touch flagged orders (fraud/refunded/cancelled),
never promises a refund — and hands angry or delivery-dispute conversations
to Gorgias with full context instead of letting a bot argue.

> Personal build. Built on Anthropic's customer-support-agent quickstart
> (anthropic-quickstarts@3313e97, MIT) — I replaced AWS Bedrock retrieval
> with a local knowledge base, added the Shopify order tool, hard guardrails,
> and the Gorgias/Slack escalation path. Demo brand and orders are fictional.

## Why not just an app-store bot?

Per-resolution pricing bites past ~300 tickets/month; WhatsApp/IG sit outside
most helpdesk AI scopes; and EU brands want the data under their control
(Bölüm 11 §4 of the strategy book). OrderSense is the owned alternative that
still plays nicely with the existing Gorgias inbox.

## Status

Skeleton — scope and measurement protocol in `docs/spec.md`.

## License

MIT — see [LICENSE](LICENSE). Original work (c) Anthropic; modifications (c) Oguz Kara.
