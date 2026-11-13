# Texting a player when it's their turn (as of 2026-11-13)

This note asks what is the cheapest compliant way, ideally free, to send a low-volume transactional SMS ("it's your turn to pick") to opted-in, verified players in the US and Canada. The sender is one individual operator with no EIN, the API is NestJS on a Heroku-style host, and the volume is tens to a few hundred texts a month. It also compares four non-SMS channels that reach a phone. `PLAN.md` puts email, SMS and push notifications, and Discord bot DMs to players, out of scope for v1 (`PLAN.md` lines 150 and 153). It names opt-in DMs as a possible later upgrade (line 117).

Confidence key: **[V]** checked on a primary source page (provider pricing page or docs, carrier support page, first-party file). **[C]** a primary page seen only through a search-engine snippet or summary, or two primary pages that disagree. **[U]** uncertain, or from memory.

Access note: Twilio's help centre (`help.twilio.com`, `support.twilio.com`) returned only a title or HTTP 403, so its fee articles are cited from search snippets. Vonage's pricing page and support site returned 403. textbelt.com and docs.textbelt.com refused connections from this machine, so Textbelt is cited from snippets only. Apple's web-push docs page didn't render, so iOS web push is cited from the WebKit blog. Pricing pages that carry a date say so below. Several pages show only a `dateModified`, and Sinch says it "aims to update prices at midnight UTC", so its prices may change daily.

Throughout, "≈ 200 texts" means 200 single-segment SMS a month to US numbers, costed with the T-Mobile/Verizon carrier fee (the higher end).

---

## Recommendation

1. **If any phone alert will do, don't use SMS.** A Discord DM from the bot the app already has costs nothing and needs no registration. Players opt in with a toggle, and the bot must share a server with them and be allowed to DM them. Web Push from the Angular app as a PWA is also free, and works on iOS 16.4+ once the app is added to the Home Screen. Either beats SMS on cost, paperwork and privacy, since there are no phone numbers to store.
2. **If it must be SMS, use a verified toll-free number, registered as a sole proprietor.** Toll-free verification has no fee at Twilio, Sinch or AWS. Twilio and AWS both accept a sole proprietor with no tax ID, and verification covers sending to both the US and Canada. 10DLC also works for a sole proprietor (Twilio, Telnyx, Vonage), but adds about $19.50 one-time and $2 a month, allows one number, and covers only US recipients.
   - **Twilio toll-free**: about **$4.70/month** at 200 texts ($2.15 number + about $0.0128 per text), **$0 one-time**. Reviewed "within three business days". Best Node SDK and docs, with STOP handled for you.
   - **AWS End User Messaging toll-free**: about **$4/month** at 200 texts ($2 number + about $0.010 per text), **$0 one-time**. Estimated 15 days to register. It also needs public privacy-policy and terms URLs and an opt-in screenshot, and setting up an AWS account and support case is more work.
   - Telnyx and Plivo are a little cheaper per text (about $3–4/month in total), but their toll-free verification fees and sole-proprietor rules weren't confirmed.
3. **Don't use** carrier email-to-SMS gateways (AT&T's shut down on 2025-06-17, and Verizon and T-Mobile call theirs legacy and ban non-consumer traffic), or Textbelt's free key (1 text a day, shared numbers).

---

## Comparison

| Option                       | Per text (US, incl. carrier fee)             | Monthly fixed              | One-time                                | Lead time                                        | Individual / no EIN?                 |
| ---------------------------- | -------------------------------------------- | -------------------------- | --------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| Twilio toll-free             | $0.0083 + $0.0035–0.005 ≈ $0.0128            | $2.15 number               | $0 verification **[C]**                 | ≤ 3 business days                                | Yes, `SOLE_PROPRIETOR` **[V]**       |
| Twilio 10DLC sole proprietor | $0.0083 + $0.0035–0.005 ≈ $0.0133            | $1.15 number + $2 campaign | $4 or $4.50 brand + $15 vetting **[C]** | Brand in minutes, campaign up to 5 business days | Yes **[V]**                          |
| AWS toll-free                | ≈ $0.007 + $0.003 = $0.010 **[C]**           | $2 number                  | none listed                             | ≈ 15 days                                        | Yes, "Sole proprietor" **[V]**       |
| AWS 10DLC                    | ≈ $0.007 + $0.00302                          | $1 number + $2–10 campaign | $4.50 + optional $41.50 vetting         | Weeks                                            | No: needs a tax ID **[V]**           |
| Telnyx toll-free             | $0.0055 + $0.0035–0.0045 ≈ $0.010            | ≈ $1–2 number **[C]**      | unknown                                 | unknown                                          | unknown                              |
| Telnyx 10DLC sole proprietor | $0.004 + $0.0035–0.0045 ≈ $0.0085            | $1 number + $2 campaign    | $4.50 brand + $15 vetting               | Campaign "typically auto-approved"               | Yes **[V]**                          |
| Plivo toll-free              | $0.0079 + $0.0045–0.005 ≈ $0.0129            | $1 number                  | unknown                                 | unknown                                          | unknown                              |
| Vonage 10DLC sole proprietor | not retrieved                                | $2 campaign + number       | $4.50 brand + $15 vetting **[C]**       | unknown                                          | Yes **[C]**                          |
| Sinch toll-free              | $0.0078 + carrier fee                        | $2 number                  | $2 setup, verification free **[C]**     | unknown                                          | unknown                              |
| Textbelt                     | not retrieved; flat, no carrier fees **[C]** | none                       | none                                    | none                                             | Yes; shared numbers                  |
| Email-to-SMS gateways        | free                                         | none                       | none                                    | none                                             | Not allowed for non-consumer traffic |
| Discord bot DM               | free                                         | none                       | none                                    | none                                             | n/a                                  |
| Web Push (PWA)               | free                                         | none                       | none                                    | none                                             | n/a                                  |
| ntfy.sh                      | free up to 250 messages a day                | $0 (paid tiers from $5)    | none                                    | none                                             | n/a                                  |
| Pushover                     | free to send, 10,000 a month                 | none                       | $4.99 per player per platform           | none                                             | n/a                                  |

At 200 texts a month, every SMS row except Textbelt lands between $3 and $6 a month. The fixed number and campaign fees outweigh the per-text cost.

---

## 1. Twilio

### 1.1 Prices (US and Canada)

- **US** (page says "Pricing current as of November 2026"): SMS out and in $0.0083 per segment for long code, toll-free and short code alike. Carrier fees on outbound SMS, long code: AT&T $0.0035, T-Mobile $0.0045, Verizon $0.005, US Cellular $0.005, others $0.0042. Toll-free carrier fees are the same except US Cellular at $0.0045. Numbers: long code $1.15/month, toll-free $2.15/month. Failed messages cost $0.001 each. The page says 10DLC is "subject to registration onboarding fees" but doesn't list them. https://www.twilio.com/en-us/sms/pricing/us **[V]**
- **Canada** (same "November 2026" note, no currency stated): $0.0083 per segment, plus carrier fees of $0.0064–0.0087 (Bell & Virgin $0.0087, Rogers & Fido $0.0084, Telus $0.0073). Numbers cost the same as in the US. So a text to Canada costs about $0.016, roughly 1.3× a US text. https://www.twilio.com/en-us/sms/pricing/ca **[V]**

### 1.2 Toll-free

- A toll-free number "can't send SMS messages to the United States and Canada until you've completed toll-free verification". Buying one needs a paid (non-trial) account and a compliance profile, and you pick "Business / Nonprofit / Sole Proprietor" to see toll-free numbers. https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding (`dateModified` 2026-09-25) **[V]**
- **Sole proprietor, no EIN:** `BusinessRegistrationNumber` is "Required for all business types except SOLE_PROPRIETOR". `BusinessType` takes `PRIVATE_PROFIT`, `PUBLIC_PROFIT`, `NON_PROFIT`, `SOLE_PROPRIETOR` or `GOVERNMENT`. "Twilio reviews TFV requests within three business days." https://www.twilio.com/docs/messaging/compliance/toll-free/api-onboarding (`dateModified` 2026-09-18) **[V]** Twilio's changelog: from 2026-02-17 new submissions need a business registration number for "all business types expect [sic] sole proprietorships". https://www.twilio.com/en-us/changelog/business-registration-numbers-required-for-toll-free-messaging-p **[V]** Error 30527 (BRN missing or invalid) says a sole proprietorship should set `businessType` to `SOLE_PROPRIETOR`. https://www.twilio.com/docs/api/errors/30527 **[C]**
- **Fee:** none listed on the docs pages. Twilio's help centre says verification is free (https://help.twilio.com/articles/11853148778523-Trial-Limits-and-US-Toll-Free-Number-Restrictions). **[C]**
- Once verified, a number "can send Application to Person (A2P) SMS messages with minimal traffic filtering". https://www.twilio.com/docs/messaging/compliance/toll-free **[V]**

### 1.3 10DLC

- **Paths** (`dateModified` 2026-10-30): Sole Proprietor needs no tax ID and is meant for "students, hobbyists" with a US or Canadian address, gets one campaign, and can send 1,000 segments a day to T-Mobile (about 3,000 across US carriers). Low-Volume Standard and Standard need an EIN or Canadian Business Number. https://www.twilio.com/docs/messaging/compliance/a2p-10dlc **[V]**
- **Sole proprietor details:** individuals who file under their own SSN or SIN qualify. Each campaign gets one 10DLC number. An OTP goes to a US or Canadian mobile that isn't a CPaaS number and can be used at most 3 times, and must be answered within 24 hours. Brand approval takes "within a few minutes", and campaign review "up to 5 business days". There is a one-time brand fee and a campaign verification fee, but the page doesn't give amounts. https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-sole-proprietor-registration-overview **[V]**
- **Fees:** Twilio's 10DLC product page lists sole proprietor at $4 brand (one-time), $15 campaign vetting (one-time) and $2/month campaign, with no date given. https://www.twilio.com/en-us/phone-numbers/a2p-10dlc **[V]** Twilio's brand-registration doc says "A one-time fee of $4.50 is required when registering a new Brand with TCR". https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand (`dateModified` 2026-09-25) **[V]** These two disagree. Other providers say TCR raised the brand fee to $4.50 on 2025-08-01 (Plivo, Vonage below), so **$4.50 is likely current**. **[C]** Twilio's fee article, https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service, returned 403.
- The $15 vetting fee is charged even if the campaign fails vetting. https://support.twilio.com/hc/en-us/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ **[C]**
- 10DLC is a US scheme. Whether a Twilio 10DLC number can text Canadian players is not covered on the pages read. **[U]**

### 1.4 Trial account

- Trials can text only verified numbers (up to 5) and expire after 30 days. 10DLC registration needs a paid account. https://www.twilio.com/docs/usage/trials **[C]** Fine for a prototype, not for production.

### 1.5 Verify (OTP)

- "$0.05 per successful verification plus standard channel fees", with US SMS at $0.0083. No base fee is charged for failed or expired verifications, but SMS attempts may still be billed. There's a free trial but no free monthly quota. "Current as of October 2026". https://www.twilio.com/en-us/verify/pricing **[V]**
- Verify sends from a "Managed number pool", so it may not need your own toll-free or 10DLC registration. The page doesn't say this outright. **[C]** For a few dozen players, about $0.06 per verification is negligible. The alternative is to send your own code from the verified toll-free number, which costs about $0.013 and no extra product. **[U]**

### 1.6 STOP handling

- By default Twilio handles STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT and CANCEL on long codes. Advanced Opt-Out, which adds custom keywords and confirmation text, is "disabled by default". On US toll-free numbers, STOP always unsubscribes and only START or UNSTOP opt back in. Sending to an opted-out number fails with error 21610. No price is mentioned. https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out (`dateModified` 2026-09-25) **[V]** The app should catch 21610 and turn the player's SMS setting off. **[U]**

---

## 2. AWS End User Messaging SMS

### 2.1 Prices

- **Pricing page** (no date shown on the page itself): 10DLC number $1/month. Toll-free number $2/month. 10DLC company registration $4.50, authentication $12.50 (public companies), vetting $41.50, campaign $10/month (regular) or $2/month (low-volume). The $50 campaign activation fee is "postponed until further notice". Canada toll-free SMS is listed at $0.00581 + $0.00705 carrier fee = $0.01286. No SMS free tier is listed; the "first 1,000,000" free sends are for push notifications, not SMS. https://aws.amazon.com/end-user-messaging/pricing/ **[V]**
- **US per text:** the pricing page links to a price CSV and doesn't list US SMS rates itself. The CSV (no date) gives US toll-free $0.007 + $0.003 carrier fee, 10DLC $0.007 + $0.00302, and Canada long code $0.007 + $0.00767. https://d1.awsstatic.com/onedam/marketing-channels/website/aws/en_US/business-applications/approved/documents/AWS_SMS_Prices.25fbab66d26aebe1e3d94f29d981f4b3f6008726.csv **[V]** (file read directly). Its Canada long-code base ($0.007) doesn't match the pricing page's Canada toll-free base ($0.00581), and Amazon Connect's pricing appendix gives US 10DLC as $0.00581 + $0.00302 (https://aws.amazon.com/products/connect/customer/pricing/appendix/). So the CSV may be stale. **[C]**

### 2.2 Toll-free

- **Sole proprietor allowed:** the registration form lists Business type "Sole proprietor – Sole proprietorship without employees". It says "Unless you select Sole proprietor, the following three company identification fields are required" (tax ID, ID type, ID country). https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-tfn-register.html **[V]**
- **Paperwork:** "Privacy Policy URL and Terms and Conditions URL fields are required for all new toll-free number registrations submitted on or after September 15, 2026." You also need an opt-in category, an opt-in workflow description, a PNG screenshot of the opt-in (400 KB max), and message samples. Same page. **[V]**
- **Lead time:** US toll-free is estimated at 15 days. https://docs.aws.amazon.com/sms-voice/latest/userguide/registration-eta.html **[V]**
- **Fee:** none listed on the pricing page beyond the $2 lease. **[V]**

### 2.3 10DLC: not open to individuals

- The brand form asks for a "Legal company name" that matches the tax ID, and a "Tax ID or Business Registration Number" (an EIN for US entities). No sole-proprietor option is shown. https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc-company.html **[V]** Expected times: brand 1–2 business days, vetting 1–2, campaign up to 4 weeks, number up to 10 days. https://docs.aws.amazon.com/sms-voice/latest/userguide/registrations-10dlc.html **[V]**

### 2.4 Sandbox: the closest thing to a free tier

- New accounts start in a sandbox: a $1.00/month SMS spend limit, only verified destination numbers (up to 10), and "to send a message to a recipient in the United States, you must first request and register a US number". Leaving it needs a support case, answered within 24 hours. https://docs.aws.amazon.com/sms-voice/latest/userguide/sandbox.html **[V]** So the sandbox doesn't remove the registration step. $1 covers roughly 100 US texts, but only to 10 numbers. **[U]**

### 2.5 STOP handling

- Built-in opt-out keywords for the US and Canada: ARRET, CANCEL, END, OPT-OUT, OPTOUT, QUIT, REMOVE, STOP, TD, UNSUBSCRIBE. "For US toll-free numbers, opt-outs are managed at the carrier level. The only supported opt-out keyword for a US toll-free number is STOP." https://docs.aws.amazon.com/sms-voice/latest/userguide/opt-out-list-keywords.html **[V]**

---

## 3. Telnyx, Plivo, Vonage, Sinch

### Telnyx

- Pricing (`dateModified` 2026-08-10): 10DLC outbound $0.004 per part, toll-free $0.0055. Carrier fees: 10DLC AT&T $0.0035, Verizon $0.0045, T-Mobile $0.0045. Toll-free AT&T $0.0035, Verizon $0.0045, T-Mobile $0.0045. Numbers "$1.00 per number per month", without splitting local from toll-free. Pay-as-you-go has no platform fee and no free tier. https://telnyx.com/pricing/messaging **[V]**
- Sole proprietor 10DLC: for "individuals and small businesses without a federal Tax ID". $4.50 brand fee charged after verification, $15 per campaign submission, $2.00/month. One campaign per brand, one number per campaign, at most 3 brands per OTP mobile, and OTP PINs expire after 24 hours. Campaigns are "typically auto-approved and become ACTIVE immediately". No page date. https://developers.telnyx.com/docs/messaging/10dlc/sole-proprietor **[V]** Telnyx's machine-readable pricing says $4. https://telnyx.com/pricing.md **[C]**
- Toll-free verification fee and sole-proprietor rules weren't found. A Telnyx doc gives toll-free at about $2/month "with one-time verification". https://developers.telnyx.com/docs/messaging/getting-started/choosing-your-sender-type **[C]**

### Plivo

- US pricing (no effective date): outbound long code $0.0077, toll-free $0.0079. Carrier fees AT&T $0.0035, T-Mobile $0.0045, Verizon $0.0050. Numbers: long code $0.50/month, toll-free $1.00/month. https://www.plivo.com/sms/pricing/us/ **[V]**
- 10DLC fees from 2025-08-01: $4.50 brand, $15 vetting, $10/month campaign or $1.50/month low-volume. https://support.plivo.com/hc/en-us/articles/360054871572-A2P-10DLC **[C]** A "Starter" path for those without an EIN is described only in an older blog post (https://www.plivo.com/blog/starter-10dlc/), so whether it still exists and what it costs is **[U]**.

### Vonage

- The pricing page and support site returned 403. Vonage's 10DLC fee article (through search) gives a $4.50 brand fee after TCR's 2025-08-01 increase, a $2/month sole-proprietor campaign, a $15 campaign vetting fee effective 2025-07-15, and an OTP for sole-proprietor brands without an EIN. https://api.support.vonage.com/hc/en-us/articles/360058158511-10-DLC-Pricing-and-Fees **[C]** Per-text US price not retrieved.

### Sinch

- Pricing page (no date; "Sinch aims to update prices at midnight UTC"): 10DLC and toll-free outbound $0.0078 plus carrier fees. 10DLC number $1/month with $1 setup, toll-free $2/month with $1–2 setup. There's a free trial, amount not stated. https://sinch.com/pricing/sms/ **[V]**
- Sinch's pages (through search): toll-free verification "is free". Sole-proprietor 10DLC campaign $2/month, brand $4. A $15 per-campaign-review fee from 2026-09-01. https://community.sinch.com/t5/Product-Pricing-FAQ/Additional-costs-associated-with-Toll-Free-Numbers-US/ta-p/11379, https://support.sinch.com/hc/en-us/articles/55501261291027-Additional-costs-associated-with-10DLC-US **[C]**

---

## 4. Textbelt

- **Free tier still exists:** "use key=textbelt to send 1 free text per day". Replies can't be received on the free key. https://textbelt.com/ and https://docs.textbelt.com/ **[C]** (site refused connections; search snippets). One text a day for the whole app is useless for a draft.
- **Paid:** prepaid credits, one per SMS, a flat price that "does not vary based on the mobile carrier or country", and no minimum spend. https://textbelt.com/about/ **[C]** Credits expire after 365 days without use. https://textbelt.com/faq/ **[C]** The current price per credit wasn't retrieved. An old blog post gives $3 as the smallest pack. **[U]**
- **Compliance:** messages go out from "a very large shared pool of phone numbers". Textbelt appends "Reply STOP to unsubscribe" and the sender name on first contact, and handles STOP and START itself. Its terms require that recipients have "explicitly opted into receiving your messages". https://docs.textbelt.com/compliance, https://docs.textbelt.com/faq/sending-and-receiving-messages, https://textbelt.com/tos/ **[C]** Textbelt handles carrier registration itself, so the operator registers nothing. That makes it the lowest-paperwork SMS option, but you can't see what's registered on your behalf. **[U]**
- The open-source Textbelt sends through carrier email gateways (https://github.com/typpo/textbelt README) **[V]**, so it inherits the shutdowns below.

---

## 5. Carrier email-to-SMS gateways

- **AT&T** (`txt.att.net`, `mms.att.net`): "Effective June 17, 2025" its "email-to-text and text-to-email service was shut down". Page last updated 2025-08-14. https://www.att.com/support/article/wireless/KM1061254/ **[V]**
- **Verizon** (`vtext.com`, `vzpix.com`): Verizon's FAQ still documents the address format, but calls it "a legacy platform built to support low-volume consumer traffic only" and "not intended for business/non-consumer (also known as A2P) messages". It points senders to Enterprise Messaging (EMAG). https://www.verizon.com/about/account-security/email-to-text-faqs **[C]** Community staff replies say vtext "has been discontinued" (https://community.verizon.com/t5/Verizon-Messages/email-to-text-messaging/m-p/1788608), but no dated official shutdown notice was found. **[C]**
- **T-Mobile** (`tmomail.net`): the gateway is a legacy system that may be decommissioned, carries low-volume consumer traffic only, and "All non-consumer messaging is prohibited". No shutdown date was found. https://www.t-mobile.com/support/plans-features/consumer-versus-non-consumer-text-messaging **[C]**
- Conclusion: an app's turn alerts are non-consumer (A2P) traffic, which Verizon and T-Mobile prohibit on their gateways and AT&T no longer carries at all. Not an option. **[V]** for AT&T; the rest is a synthesis.

---

## 6. Non-SMS alternatives

### 6.1 Discord DM from the existing bot

- Cost: free. `POST /users/@me/channels {recipient_id}`, then send a message. The docs say not to use it "to DM everyone in a server about something", that DMs should generally follow a user action, and that opening "a significant amount of DMs too quickly" can get a bot rate-limited or blocked. https://docs.discord.com/developers/resources/user **[V]**
- Opt-in: a per-player "DM me when it's my turn" toggle. The player must share a server with the bot and allow DMs from its members, or the send fails with `50007`. See `docs/research/discord.md` §4 for the details and sources. A single DM per turn to an opted-in player is well inside the doc's guidance. **[U]**
- Feasibility: the api already has the bot's REST client, and `PLAN.md` line 180 lists DMs among its uses (for setup). A pick-turn DM is a small step from the existing `DraftNotifier`. The phone alert relies on the Discord app's own notification settings. **[U]**

### 6.2 Web Push via a PWA

- Cost: free. You need VAPID keys and a service worker. "You do not need to be a member of the Apple Developer Program to use it." **[V]**
- iOS: iOS and iPadOS 16.4+. "A web app that has been added to the Home Screen can request permission to receive push notifications", and only "in response to direct user interaction". It uses the standard Push API, Notifications API and Service Workers. https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (2023-02-16) **[V]** Android Chrome and desktop browsers don't need a Home Screen install. **[U]**
- Opt-in: the browser's permission prompt after the player taps a "Notify me" button, plus Add to Home Screen on iPhone. This is the most friction for iPhone users of any option here. **[U]**

### 6.3 ntfy

- Cost: ntfy.sh is free without sign-up. The hosted server allows a daily limit of 250 messages per visitor (IP), and 60 requests at once refilling one every 5 seconds. https://docs.ntfy.sh/publish/ (Limitations) **[V]** Paid tiers are Supporter $5/month (2,500 messages a day), Pro $10, Business $20, and reserve topic names. https://ntfy.sh/#pricing **[V]**
- Opt-in: the player installs the ntfy app and subscribes to a topic. On the free tier a topic name is the only access control, so the app would have to issue each player an unguessable topic. **[U]** Self-hosting is possible (Apache 2.0 / GPLv2), but instant iOS delivery needs `upstream-base-url` pointing at ntfy.sh or another APNs-connected server. https://docs.ntfy.sh/config/ **[V]**

### 6.4 Pushover

- Cost to send: "Each user can send up to 10,000 messages per month for free". Each receiving player pays "$4.99 USD one-time purchase" per platform after a 30-day trial. https://pushover.net/pricing **[V]**
- Opt-in: the player installs Pushover, buys it, and pastes their user key into Swantisserie. Asking players to pay rules it out for a community app. **[U]**

---

## 7. Compliance that applies to any SMS option

- CTIA's Messaging Principles and Best Practices (May 2023) say consent should be documented and specific to the sender and campaign. Consumers must be able to opt out at any time, with STOP as the standard instruction, and natural-language requests ("stop", "end", "unsubscribe", "please opt me out") must be honoured. One opt-out confirmation, then nothing more. https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf **[C]** (PDF not opened; search excerpts)
- In practice, both the toll-free and the 10DLC forms ask for: an opt-in flow with a screenshot (a checkbox on the profile page, unticked by default, naming the message type and "Reply STOP to opt out"), a privacy policy and terms (AWS requires public URLs from 2026-09-15), and sample messages. **[V]** for AWS (§2.2). The Twilio form fields weren't read. **[U]**
- "Verified" phone numbers: send a one-time code before storing the number (Twilio Verify §1.5, or your own code). This also proves the opt-in. **[U]**

---

## 8. Delayed sends: Twilio Message Scheduling, or QStash as the fallback

This matters for a reminder, such as "still your turn" sent N minutes after the turn starts and cancelled if the player picks first. The first "it's your turn" text should be sent straight away and needs no scheduling.

### 8.1 Twilio Message Scheduling

Source for all of the following unless noted: https://www.twilio.com/docs/messaging/features/message-scheduling (`dateModified` 2026-08-03).

- **Messaging Service required:** yes. `MessagingServiceSid` is one of the parameters "a scheduled message requires", alongside `ScheduleType=fixed` and `SendAt`. Without it, the message is sent straight away, unscheduled. **[V]**
- **Lead time:** "Messages must be scheduled between 15 minutes and 35 days before" `SendAt`. **[V]** So the shortest delay is **15 minutes**, which rules it out for reminders sooner than that.
- **Toll-free sender:** the scheduling page doesn't mention sender types. A Messaging Service's sender pool can hold "Alphanumeric Sender IDs, short codes, long code phone numbers, toll-free phone numbers, RCS senders, and WhatsApp senders". https://www.twilio.com/docs/messaging/services (`dateModified` 2026-09-30) **[V]** So a toll-free number in a Messaging Service should be able to send scheduled messages. That is inferred, not stated. **[C]**
- **Cost:** "Message scheduling comes at no cost and Twilio only charges for messages sent." A Messaging Service has no listed fee either. **[V]**
- **Cancel:** update the Message resource (`POST /2010-04-01/Accounts/{AccountSid}/Messages/{Sid}.json`) with `Status=canceled`. This fires a `canceled` status callback. In the Node SDK that's `client.messages(sid).update({ status: 'canceled' })`. The `canceled` status means "The message scheduled with a Messaging Service has been canceled". https://www.twilio.com/docs/sms/api/message-resource **[V]** for the endpoint and status. **[U]** for the Node SDK call. The pages don't say whether a cancelled message is billed, or how close to `SendAt` you can still cancel. Since Twilio "only charges for messages sent", a cancelled message presumably costs nothing. **[C]**
- **Outstanding limit:** "up to 500,000 scheduled messages at any given time" per account or subaccount, and a subaccount's count doesn't use up its parent's. **[V]** Far above anything Swantisserie needs.
- The API returns the message SID when it accepts the schedule. The app would store it on the turn so it can cancel when the player picks. **[U]**

### 8.2 Upstash QStash delayed messages (fallback)

QStash calls a URL on the api (for example `POST /internal/turn-reminder`) after a delay. The handler checks whether the turn is still open, then sends the text with any provider. This works for delays shorter than Twilio's 15 minutes, and for senders that don't support scheduling.

- **Free tier** ($0/month): 1,000 messages a day, 1 MB per message, **maximum delay 7 days**, 10 active schedules, 10 queues, 3 days of DLQ and log retention. "Each retry counts as an additional billed message". **Pay as you go:** $1 per 100K messages, no daily cap, maximum delay 1 year. No page date (footer "© 2026"). https://upstash.com/pricing/qstash **[V]**
- **Delay:** an `Upstash-Delay` header (`10s`, `1m`, `7d`), relative to publish time, or `Upstash-Not-Before` (a Unix timestamp in seconds, UTC), which wins if both are set. https://upstash.com/docs/qstash/features/delay **[V]** No minimum is stated, so seconds-scale delays work. **[U]**
- **Cancel:** `DELETE /v2/messages/:messageId` while the message is pending or retrying. It logs `CANCEL_REQUESTED`, then `CANCELLED`. The TypeScript SDK call is `client.messages.cancel()`. https://upstash.com/docs/qstash/howto/debug-logs and https://upstash.com/docs/qstash/sdks/ts/examples/messages **[C]** (search excerpts). Cancelling is optional if the handler re-checks the turn anyway, and that check is safer because it doesn't race the pick. **[U]**
- The receiving endpoint must check QStash's request signature (`Upstash-Signature`), since it is publicly reachable. **[U]** (from memory of the SDK's `Receiver`; not checked this session)
- At Swantisserie's volume (one reminder per turn), the free tier's 1,000 a day is ample. **[U]**

---

## Open questions

1. Is SMS needed at all, or will a Discord DM (free, already half-built) or Web Push do? This decides whether any of §1–4 matters. It would also need `PLAN.md` changed, since DMs and SMS are out of scope for v1.
2. How many players are in Canada? Both Twilio's and AWS's US toll-free verification cover Canada, but a 10DLC number's reach to Canadian handsets wasn't confirmed. Canadian texts cost about 1.3× US ones at Twilio.
3. Twilio's current sole-proprietor 10DLC brand fee: $4 (product page) or $4.50 (brand doc)? Twilio's fee article returned 403. Only matters if 10DLC is chosen.
4. Does Twilio's toll-free verification need a public privacy-policy URL and a "website", as AWS's does? Swantisserie would need a privacy page either way, since it would store phone numbers.
5. Telnyx and Plivo toll-free: verification fee, and whether a sole proprietor can verify. Both are slightly cheaper than Twilio if so.
6. Textbelt's current price per credit. The site refused connections from this machine.
7. AWS's real US per-text price: the undated CSV ($0.007 base) or the newer $0.00581 seen elsewhere?
8. Can a text be kept to one segment? "It's your turn to pick in <draft name>" plus a link and the first-message STOP footer must fit in 160 GSM-7 characters. Draft names with emoji switch to UCS-2 (70 characters) and double the cost.
