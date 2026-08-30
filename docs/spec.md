# OrderSense — Spec (v1, 2026-08-30)

Portfolyo projesi #4 (strateji: upwork-strategy Bölüm 04/11). AB'li Shopify
giyim markası için kendi destek ajanı: bilgi tabanından cevap, canlı sipariş
sorgusu, sert korkuluklar, öfke/karmaşıklıkta Gorgias'a devir.

## Persona (kurgusal)

Loura Apparel — AB (DE/FR/NL) Shopify giyim markası, ~4.000 sipariş/ay →
~800 ticket/ay (%32 WISMO, %14 iade); 3 dil; WhatsApp+IG temasların %30'u.
Tetik: BFCM sonrası Gorgias AI faturası + yarı zamanlı ajanın istifası
(Bölüm 11 §4). Büküm: çözüm-başı ücret yerine kendi ajanı; Gorgias'a
bağlamlı handoff.

## Taban

anthropics/anthropic-quickstarts@3313e97 → customer-support-agent (MIT,
kök LICENSE kopyalandı). Hazır gelen: 3 panelli chat UI (sol: thinking
debug, orta: chat, sağ: kaynaklar), ruh hali tespiti, redirect_to_agent
bayrağı, tema sistemi. Değişecek: AWS Bedrock KB → yerel bilgi tabanı;
model ID'leri güncel; Shopify/Gorgias katmanı bizim.

## Kapsam

**v1 — çekirdek (mock'ta uçtan uca)**
- [ ] Bedrock'u söküp yerel retrieval: `data/policies.md` bölümleri
      (v1: başlık-bazlı bölümleme + anahtar kelime eşleme; pgvector v2)
- [ ] `lib/shopify.ts` mock mağaza: e-posta/sipariş no ile arama
      (`data/orders.json`); "don't panic" eşik mantığı (yurtiçi 5 /
      yurtdışı 12 iş günü)
- [ ] Korkuluklar (kod seviyesinde, prompt'a ek): `fraud_risk`/`refunded`/
      `cancelled` bayraklı siparişte cevap YOK → doğrudan eskalasyon;
      iade SÖZÜ verilmez (yalnız uygunluk bilgisi); her eylem sipariş no
      ile loglanır
- [ ] Eskalasyon: öfke tespiti (tabanda var) veya "delivered ama gelmedi"
      → `lib/escalate.ts`: Gorgias ticket simülasyonu + Slack webhook
      (Prequal deseni) + `ai-escalated` kaydı
- [ ] Model: PREQUAL/BILLPILOT deseni — `ORDERSENSE_MODEL ?? claude-sonnet-5`;
      `ORDERSENSE_MOCK=1` deterministik yanıt (kredisiz UI geliştirme)
- [ ] Çok dil: EN/DE/FR (persona dili; sistem promptunda)

**v2 — ölçüm + entegrasyon**
- [ ] Test konuşma seti (20+): doğru sipariş bulma, korkuluk ihlali 0,
      eskalasyon tetikleme doğruluğu → README Measured (yalnız gerçek koşu)
- [ ] Ledger primitive dili + `/tickets` görünümü; gerçek Slack webhook
- [ ] n8n: eskalasyon akışı (Gorgias API stub → gerçek)

## Portfolyo varlıkları (3 kart)

1. Chat + thinking + kaynak paneli ekranı (taban UI'ın gücü)
2. Mimari: kanal → ajan → [KB | Shopify lookup | korkuluklar] → Gorgias/Slack
3. Loom: "kızgın müşteri" senaryosu — korkuluk + bağlamlı handoff

## Attribution

Base: anthropics/anthropic-quickstarts@3313e97 customer-support-agent (MIT).
