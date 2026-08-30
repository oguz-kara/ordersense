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

**v1 — çekirdek (2026-08-30 tamamlandı, mock'ta uçtan uca doğrulandı)**
- [x] Bedrock söküldü → `app/lib/kb.ts`: policies.md başlık bölümleme +
      anahtar kelime skorlama; RAGSource arayüzü korundu (sağ panel çalışır)
- [x] `app/lib/shop.ts`: LA-xxxxx / e-posta ile mock mağaza araması;
      iş-günü hesabıyla don't-panic eşiği (AB 5 / dışı 12); delivered +
      "gelmedi" → insan yönlendirme talimatı
- [x] Korkuluk ön-kontrolü: bayraklı siparişte **model hiç çağrılmaz** —
      route içinde erken dönüş + eskalasyon kaydı (curl testi: fraud_risk
      → redirect + escalations.json ✓)
- [x] `app/lib/escalate.ts`: Gorgias simülasyonu + Slack + yerel log;
      model kaynaklı redirect'ler de buraya düşer
- [x] Model `ORDERSENSE_MODEL ?? claude-sonnet-5`; **taban prefill'i
      söküldü** (güncel modellerde 400); `ORDERSENSE_MOCK=1` deterministik
      yanıt — policy/sipariş/korkuluk yolları curl'le doğrulandı
- [x] Sistem promptu: Loura personası, EN/DE/FR, sert kurallar (iade sözü
      yok, yalnız ORDER CONTEXT gerçekleri)

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
