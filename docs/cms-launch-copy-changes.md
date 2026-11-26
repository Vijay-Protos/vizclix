# VizClix launch copy: CMS changes to apply (Polycrayons CMS, vizclix-site)

The "[ … to confirm ]" notes on the live page come from CMS `note` fields. Clear each note below
(empty value). Where the text needs more than a cleared note, the new text is given.
No prices, turnaround days or revision counts are invented: the page says they are set in the quote.

| Field | Change |
|---|---|
| study.head.note | clear |
| services.items[0,1,3,5].note | clear |
| process.steps[0].note | clear |
| process.steps[4].note | clear; body -> "Cut, colour-graded and delivered by link in the formats your team posts. Revision rounds are agreed in the quote." |
| partner.weBring[4].note | clear |
| faq.items[0].note | clear |
| faq.items[1].note | clear; answer -> "Tell us the city. We confirm in our first reply whether we or a partner pilot can cover it. We are building an operator network city by city, so ask even if you think you are outside it." |
| faq.items[3].note | clear |
| faq.items[4].note | clear; answer -> "It depends on scope and weather. We give a delivery date in the quote, before you commit." |
| faq.items[5].note | clear |
| faq.items[6].note | clear; answer -> "By scope: how many locations, how many flying days, film or stills, and how long the edit runs. Every project is quoted in writing after the brief." |
| faq.items[8].note | clear |
| contact.head.note | clear |
| footer.contactLine | "info@protossofttech.com" (phone and legal entity removed until the owner supplies them) |
| study.caption | remove the square brackets only |

## Also applied 26 Nov (second pass)
- study.deliveredNote ("Durations, counts and fees set per project") cleared
- partner.citiesNote ("network in formation — no coverage claimed yet") cleared
- proof.slots emptied. Restore when real content exists:
  - Client Words: "A real quote, with name, role and permission."
  - Credentials Held: "Pilot certification and the airspace permissions actually in hand."

Rollback: full pre-change CMS entry saved at ~/Backups/vizclix/vizclix-site-before-copy-cleanup-20261126.json (Mac).
