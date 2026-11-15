# 015 (PROPOSED by S13 -> LEAD must accept and move to docs/decisions/): model tiers, private = local only
Status: Proposed. Amit's orders 14 Nov 2026.
Decision: 4 tiers: free (daam 0, roz ki request limit), almost_zero (paise), paid_big (Fable/Opus/Sonnet/Argon: list mein, band jab tak Amit na khole), local. Sirf free + almost_zero abhi on.
Private (memory T2/T3) = sirf local; local nahi to chat refuse; cloud par kabhi nahi. Ye 014 ke "approved PAID private slot" ko REPLACE karta hai (packages/chat model-router.ts private slot hata do).
Daam sirf official page se, source URL + checked_on ke saath; unverified/unpriced = refuse. Fallback: free -> agla free -> almost_zero (notice), kabhi chupke paid_big nahi.
INR: rate env/settings se, hardcoded nahi; rate na ho to INR budget refuse.
