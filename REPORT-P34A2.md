# JARVIS P34a-2 Verification Report

**Date:** 2026-11-25  
**Base Branch:** `kill-fix` (`8e998bcc89281d244280baf4687e1afa56986b15`)  
**Report Branch:** `reports/p34a2`  
**Target Environment:** Vercel Preview  
**Project:** `shehamar70-9192s-projects/jarvis`  

---

## 1. Executive Summary

In task **P34a-2**, the Kill Switch subsystem (`/api/system/*`) was activated on the Vercel Preview environment by provisioning the required `DEVICE_TOKEN_PEPPER` environment variable. Prior to this, all `/api/system/*` routes failed closed with `503 Service Unavailable ("system API is not configured; safety is treated as ON")` because `DEVICE_TOKEN_PEPPER` was missing in Preview.

All operations strictly adhered to the safety rules:
- **Production & Core Branches:** Untouched. `main` and `jarvis-v2` were not accessed or modified. Production environment variables were not altered.
- **Secrets Management:** Pepper, owner keys, and bypass secrets were passed exclusively via stdin / process memory and never printed or committed.
- **Safety Switch Integrity:** `kill.set` was tested only with invalid payload validation (`400 Bad Request`). The kill switch was never toggled ON or OFF in the shared database.

---

## 2. Vercel Deployment & Configuration

1. **Environment Configuration**:
   - `DEVICE_TOKEN_PEPPER`: Generated a high-entropy 32-byte hex pepper (`openssl rand -hex 32`) and set strictly for the `Preview` environment via stdin (`npx vercel env add DEVICE_TOKEN_PEPPER preview`).
   - Production target env variables were inspected (names only) confirming Production already had `DEVICE_TOKEN_PEPPER` configured.
   - `OWNER_ENTRY_KEY`: Set specifically for the `Preview` environment via stdin to enable end-to-end owner unlock in Preview.
2. **Deployment**:
   - **Deployment UID:** `dpl_5ZY8ua8QkCkFJYv5Afc3SzmJL4M6`
   - **Preview URL:** `https://jarvis-6auocidj4-shehamar70-9192s-projects.vercel.app`
   - **Status:** `● Ready`

---

## 3. Real curl Route Measurements

All measurements were taken against the live Preview deployment using the Vercel Deployment Protection bypass header (`x-vercel-protection-bypass`).

### 3a. Unauthenticated Access (All Must Be 401 & < 2.0s)

| Route | HTTP Method | Cold Status | Cold Time | Warm Status | Warm Time | Response Body |
|---|---|---|---|---|---|---|
| `/api/system/kill.get` | GET | **401** | **0.291s** | **401** | **0.310s** | `{"ok":false,"error":{"code":"unauthorized","message":"owner session or paired device token is required"}}` |
| `/api/system/kill.set` | POST | **401** | **1.146s** | **401** | **0.327s** | `{"ok":false,"error":{"code":"unauthorized","message":"owner session or paired device token is required"}}` |
| `/api/system/events.list` | POST | **401** | **1.060s** | **401** | **0.316s** | `{"ok":false,"error":{"code":"unauthorized","message":"owner session or paired device token is required"}}` |
| `/api/system/events.emit` | POST | **401** | **1.185s** | **401** | **0.308s** | `{"ok":false,"error":{"code":"unauthorized","message":"owner session or paired device token is required"}}` |

*Note: All cold and warm response times are well within the 2.0-second SLA limit (warm latencies ~310ms).*

### 3b. Authenticated Owner Session (`kill.get`)

- Authenticated via `POST /api/auth/owner.enter` passing the preview owner entry key; captured `jarvis_session` cookie.
- Tested `GET /api/system/kill.get` with owner session cookie:
  - **Cold Status:** `200 OK` in **1.252s**
  - **Warm Status:** `200 OK` in **0.479s**
  - **Response Payload:** `{"ok":true,"data":{"kill":false,"epoch":3,"changed_at":"2026-11-22T12:53:26.186892+00:00"}}`

### 3c. Invalid Body Validation (`kill.set`)

- Tested `POST /api/system/kill.set` with invalid payload `{"invalid_field": 123}` using owner session:
  - **Cold Status:** `400 Bad Request` in **1.062s**
  - **Warm Status:** `400 Bad Request` in **0.370s**
  - **Response Payload:** `{"ok":false,"error":{"code":"bad_request","message":"body must contain kill:boolean and optional reason (max 500 characters)"}}`
- **Database Safety Verification:** The kill switch was never changed (`kill: false`, `epoch: 3` remained constant), protecting the production instance.

---

## 4. Playwright Mobile UI Verification (390x844)

- **Viewport:** 390 x 844 (Mobile viewport)
- **Execution:** Automated browser navigation to `https://jarvis-6auocidj4-shehamar70-9192s-projects.vercel.app` with `x-vercel-protection-bypass`.
- **Unlock Sequence:** Entered `OWNER_ENTRY_KEY` into `#owner-key-input` on the Owner Lock screen and clicked `#owner-key-btn`.
- **KillSwitch Rendering:**
  - Control: Topbar `KillSwitch` rendered (`[data-testid="kill-switch"]`).
  - Class: `jarvis-kill is-off`
  - Text: `Safety OFF`
  - Title: `Safety switch · epoch 3`
  - Aria Label: `Turn kill switch ON`
- **Screenshot:** Saved to `p34a2-unlocked-mobile.png` with visual watermark: `REAL screenshot · P34a-2 Preview (390x844)`.

---

## 5. Deliverables & Artifacts

- Report file: `REPORT-P34A2.md`
- Mobile UI screenshot: `p34a2-unlocked-mobile.png`
- Branch: `reports/p34a2`
