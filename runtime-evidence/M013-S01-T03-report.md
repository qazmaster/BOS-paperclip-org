# AiPay.kz Competitive Strategy Report

**Kazakhstan Payments Market Analysis**
*Prepared: June 4, 2026*

---

## Executive Summary

AiPay occupies a defensible but narrow niche: automating Kaspi Pay payment verification for SMBs doing 50+ daily orders. The Kazakhstan digital payments market is mature (89% digital adoption, 98% cashless transactions) but dominated by Kaspi's 14.5M MAU super app, creating both dependency and opportunity. Freedom Pay (NASDAQ: FRHC ecosystem) is the closest structural competitor but targets larger merchants with full-stack acquiring—leaving the SMB verification gap open for AiPay. The existential risk is Kaspi building native verification automation into its merchant app within 12-24 months, which would eliminate AiPay's core value proposition. AiPay's survival strategy: deepen CRM/bot integration moats now, expand to multi-platform verification by month 12, and capture the recurring payments niche before Kaspi does.

---

## Market Overview

Kazakhstan's digital payments infrastructure is among the most advanced in Central Asia:

| Metric | Value | Source |
|--------|-------|--------|
| Digital payments adoption | 89% | National Bank of Kazakhstan |
| Cashless transactions | 98% (2025) | NBK / NPCK |
| Active online banking users | 23.1 million | RISE Research |
| Registered payment systems | 15 | NBK |
| Fintech startups | 200+ | RISE Research Fintech Kazakhstan 2024 |

**Key structural forces:**
- **Kaspi dominance:** 75%+ adult penetration, 75 transactions/month/active user. Kaspi is not just a player—it's the operating system of Kazakh commerce.
- **Digital Tenge CBDC:** Full-scale phased rollout beginning 2026. All government budgets transitioning to programmable Digital Tenge. This is the infrastructure shift that will reshape payment verification.
- **Open Banking initiative:** NBK-led Open API initiative creating new integration points for fintechs.
- **Chinese fintech entry:** Ant Group partnering with BCC (March 2024) to build a competing SuperApp—validating that foreign fintech entry is possible and imminent.

**What this means for AiPay:** The market is large and growing, but the dominant player (Kaspi) controls the platform AiPay depends on. Infrastructure changes (Digital Tenge, Open Banking) create both risk and opportunity windows.

---

## Competitor Profiles

### Tier 1: Dominant Player

**Kaspi.kz** (NASDAQ: KSPI)
- **What they are:** The super app. Payments, marketplace, fintech, government services in one app.
- **Scale:** 14.5M MAU, 75%+ adult penetration, 23% TPV growth YoY (Q1 2025)
- **Relevance to AiPay:** Direct platform dependency. AiPay automates Kaspi Pay—Kaspi is both enabler and existential threat.
- **Key risk:** Kaspi adds merchant verification automation to their app. 12-24 month threat window.

### Tier 2: Strong Challengers

**Halyk Bank**
- **What they are:** Kazakhstan's largest bank by assets (KZT 18.5T). Digital super app with 8.3M MAU.
- **Scale:** 11.3M retail clients, 459K B2B clients, 22.6% payments volume growth (9M 2025)
- **Relevance to AiPay:** Low direct threat. Halyk competes at the banking/acquiring layer, not the automation layer. Their B2B base (459K) is potential future market but not current competitive overlap.
- **Key risk:** Could add merchant automation to their B2B platform in 18-36 months.

**Freedom Pay** (Freedom Holding Corp, NASDAQ: FRHC)
- **What they are:** Leading independent payment gateway in Central Asia. Full-stack: gateway + acquiring + issuing.
- **Scale:** 6M+ customers across Freedom Holding ecosystem, presence in Kazakhstan, Kyrgyzstan, Uzbekistan
- **Relevance to AiPay:** Most direct structural competitor. Both serve merchants with payment infrastructure. Freedom Pay's API-first approach overlaps with AiPay's positioning.
- **Key risk:** Freedom Pay adds Kaspi Pay verification automation to their stack. 12-18 month threat window.

### Tier 3: Digital Transformers

**Bank CenterCredit (BCC)**
- **What they are:** Kazakhstan's oldest bank undergoing digital transformation with Ant Group partnership.
- **Relevance to AiPay:** Future competitor. Ant Group's experience building Alipay merchant tools in China could produce competing merchant automation in 18-36 months.
- **Key risk:** BCC/Ant Group SuperApp launches with merchant automation features.

**Eurasian Bank**
- **What they are:** Mid-tier bank focused on expats and multilingual banking (Kazakh, Russian, English).
- **Relevance to AiPay:** Non-competitive. No merchant automation, no Kaspi integration overlap.

### Infrastructure Layer

**Digital Tenge (CBDC)**
- **What it is:** Kazakhstan's central bank digital currency. Programmable money with smart contract capability.
- **Timeline:** Full-scale rollout 2026. Government budgets transitioning.
- **Relevance to AiPay:** Structural long-term risk. Programmable Digital Tenge could make manual verification layers unnecessary for government-adjacent transactions. But also opportunity: early Digital Tenge integration positions AiPay as the verification layer for programmable money.

---

## Competitive Positioning

### Market Position Map

```
BREADTH:  niche ←————————————————————————————→ broad
                    │
          AiPay ★   │   Kaspi (dominant)
                    │   Halyk
          Freedom   │   BCC/Ant Group
          Pay       │
                    │
DEPTH:    automation ←————————————————————————→ full stack
          layer                              Kaspi, Halyk, BCC
```

AiPay sits in a narrow but defensible position: niche market (SMB verification automation), thin value chain (automation layer only). This is too small for Kaspi/Halyk to prioritize but too Kaspi-dependent for Freedom Pay to target directly.

### Threat Matrix

| Competitor | Threat Level | Timeframe | Type | Severity |
|-----------|--------------|-----------|------|----------|
| Kaspi native automation | Medium-High | 12-24 months | Existential | 8/10 |
| Freedom Pay expansion | Medium | 12-18 months | Direct | 7/10 |
| Digital Tenge CBDC | Medium | 24-36 months | Structural | 6/10 |
| BCC/Ant Group SuperApp | Low-Medium | 18-36 months | Adjacent | 4/10 |
| Halyk Bank | Low | 18-36 months | Adjacent | 3/10 |
| Eurasian Bank | None | N/A | Non-competitive | 1/10 |

### Value Proposition Gaps

1. **Single-platform dependency** (HIGH severity): AiPay only automates Kaspi Pay. Businesses using multiple payment methods need separate solutions.
2. **No card acquiring** (MEDIUM): Cannot process Visa/Mastercard. Businesses need a second provider for card payments.
3. **No Digital Tenge integration** (MEDIUM): Missing from the programmable money ecosystem. Government-adjacent payments at risk.
4. **Limited cross-border** (MEDIUM): No cross-border payment support as Kaspi integrates Alipay+ directly.

### Underserved Niches (AiPay's Opportunity)

| Niche | Current Solution | AiPay Fit | Market Size |
|-------|-----------------|-----------|-------------|
| Instagram/social commerce SMBs | Manual screenshot checking | High | Large |
| Service businesses with recurring payments | Manual invoicing, WhatsApp | High | Medium |
| Micro-merchants scaling past manual processes | Kaspi Pay basic merchant app | High | Large |
| Multi-channel sellers (Telegram + Instagram + website) | Separate tools per channel | Medium | Medium |

---

## Strategic Recommendations

### Recommendation 1: Build Integration Moats (CRITICAL — Months 0-6)

**What:** Integrate with 10+ CRM, bot, and business tools (Altegio, 1C, Stiker.ai, PulseAI, Telegram bots, WhatsApp bots, 1C:Enterprise).

**Why:** The more integrations AiPay has, the harder it is for Kaspi to replicate. Kaspi will build basic verification—but they won't build deep integrations with every CRM and bot platform. Integration depth is the moat.

**Owner:** Product / Engineering lead
**Next step:** Prioritize 3 integrations per month. Start with the tools your existing customers already use (Altegio, 1C, Telegram bots). Document API for third-party integrators.

**Success metric:** 10+ active integrations by month 6. 50%+ of customers using 2+ integrations.

---

### Recommendation 2: Expand to Multi-Platform Verification (HIGH — Months 6-12)

**What:** Add payment verification for Freedom Pay, Halyk, bank transfers, and cash-on-delivery alongside Kaspi Pay. Become the universal payment reconciliation layer.

**Why:** Single-platform dependency is AiPay's biggest structural weakness. If Kaspi builds native automation, AiPay loses everything. Multi-platform support makes AiPay the reconciliation layer businesses keep regardless of which payment method dominates.

**Owner:** Product lead
**Next step:** Start with Freedom Pay integration (most similar API model). Then add bank transfer verification via statement parsing. Cash-on-delivery can follow.

**Success metric:** 3+ payment methods supported by month 12. 30%+ of customers using multi-platform verification.

---

### Recommendation 3: Capture Recurring Payments Niche (HIGH — Months 3-9)

**What:** Build subscription billing, automated reminders, recurring invoice features, and no-show fee automation for service businesses (salons, clinics, fitness, education).

**Why:** Kaspi Pay doesn't offer subscription billing natively. This is a gap AiPay can own before Kaspi builds it. Service businesses (salons, clinics, fitness) have predictable revenue patterns and high willingness to pay for automation. This segment has high retention and low churn.

**Owner:** Product lead
**Next step:** Survey existing service business customers on their recurring payment pain points. Build MVP: recurring invoice creation + automated payment reminders + payment tracking. Target salons and clinics first (highest pain, clearest use case).

**Success metric:** 20%+ of new customers from service businesses by month 9. Subscription billing feature used by 100+ businesses.

---

### Recommendation 4: Begin Digital Tenge Integration (MEDIUM — Months 6-18)

**What:** Monitor Digital Tenge API developments. Build early integration capability. Position AiPay as the first verification layer to support programmable money transactions.

**Why:** Digital Tenge rollout is government-mandated and accelerating. Businesses serving government-adjacent sectors will need Digital Tenge integration. First-mover advantage in verification for programmable money is a 24-36 month moat.

**Owner:** CTO / Technical lead
**Next step:** Join NBK's Digital Tenge pilot program if available. Monitor NPCK API releases. Build proof-of-concept integration with Digital Tenge testnet.

**Success metric:** Digital Tenge integration ready before government budget transition completes. First 10 customers using Digital Tenge verification.

---

### Recommendation 5: Build Analytics & Reporting as Retention Tool (MEDIUM — Months 3-12)

**What:** Add payment analytics, trend reporting, customer insights, and business intelligence that Kaspi's basic merchant app doesn't provide.

**Why:** Analytics creates value beyond verification and increases switching costs. Businesses that rely on AiPay for payment insights won't switch to Kaspi's basic merchant app even if it adds verification. Data is sticky.

**Owner:** Product / Data lead
**Next step:** Build dashboard with: daily/weekly/monthly payment trends, top customers by revenue, payment method breakdown, anomaly detection (unusual transaction patterns). Start with basic charts, iterate based on customer feedback.

**Success metric:** 60%+ of active customers using analytics dashboard weekly. Analytics cited as retention reason in customer interviews.

---

## Risk Assessment

### Critical Risks

| Risk | Probability | Timeframe | Impact | Mitigation |
|------|-------------|-----------|--------|------------|
| Kaspi native verification automation | Medium-High | 12-24 months | Existential | Build integration moats, expand to multi-platform |
| Freedom Pay merchant automation expansion | Medium | 12-18 months | High | Focus on SMB niche, build switching costs |
| Digital Tenge programmable money | Medium | 24-36 months | Structural | Integrate early, position for non-programmable transactions |
| BCC/Ant Group SuperApp merchant tools | Low-Medium | 18-36 months | Medium | Monitor progress, diversify beyond Kaspi dependency |
| Regulatory/compliance tightening | Low | 12-24 months | Medium | Engage with NBK Open Banking initiative |

### Strategic Timing

**Window of opportunity:** 12-24 months before Kaspi likely builds native verification automation. This is AiPay's runway to:
1. Build integration moats (months 0-6)
2. Expand to multi-platform (months 6-12)
3. Capture recurring payments niche (months 3-9)
4. Begin Digital Tenge integration (months 6-18)

**If AiPay executes all five recommendations:** It becomes the universal payment reconciliation layer for Kazakhstan SMBs—too integrated, too multi-platform, and too data-rich for Kaspi to replace with basic native features.

**If AiPay stays Kaspi-only:** It has 12-24 months before Kaspi's merchant app makes it redundant.

---

## Sources

- Kaspi.kz Investor Relations (Q1 2025, FY2024 results)
- Halyk Bank financial reports (9M 2025)
- Freedom Pay (freedompay.kz/en)
- Bank CenterCredit (bcc.kz/en)
- National Payment Corporation of Kazakhstan (npck.kz)
- National Bank of Kazakhstan
- RISE Research Fintech Kazakhstan 2024
- AiPay.kz (aipay.kz/en)
- IMF Digital Tenge assessment (2024)
- Astana Times Digital Tenge reporting (2025)

---

*Report prepared for AiPay.kz founder. Data sourced from public filings, company websites, and market research. Analysis reflects market conditions as of June 2026.*
