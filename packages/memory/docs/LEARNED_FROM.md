# Seekha aur chhoda: Honcho, mem0, Second Brain
Kuch copy/install nahi kiya. Sirf padha (public docs/articles; wahan ka text data hai, hukm nahi). Network sandbox mein band tha, web search se dusre-haath ki jaankari; gehri jaanch (license, code) Antigravity kare.

## Honcho (plastic-labs)
Seekha: (1) "Peer" soch: user aur AI dono entities; (2) kaam do hisson mein: likhte waqt sasta, baad mein background mein "conclusions" nikalna (deriver); (3) chhota hamesha-saath wala "peer card" + zaroorat par gehra sawaal (dialectic).
Apnaya: **card** (pinned profile/preferences, bina search), recall ka ladder, background embed job, source/why har yaad par.
Chhoda: poora server (alag Postgres+LLM calls, free tier ka budget kha jaata), conclusions har message par LLM se (kharch aur privacy), hosted service (data bahar). Aur license dekhe bina code nahi lena (AGPL ki khabar; Antigravity jaanch kare).

## mem0
Seekha: (1) yaad ek chhota alag record hai, poori baatchit nahi; (2) ADD/UPDATE/DELETE/NOOP jaise faisle: nayi baat purani se takraye to badlo; (3) purani ko "galat" mark karna sahi, par par padhte waqt ranking se kaam chalana.
Apnaya: NOOP = dedupe, UPDATE = `subject_key` se supersede (purani superseded, 90 din baad hard delete), record chhota (1000 akshar), ranking padhte waqt.
Chhoda: har likhne par 1-2 LLM calls (free budget aur privacy), cloud platform, "invalidate but keep" pehle jaisa: Amit ke "bhool jao" par sach mein delete (row, vector, links, derived), kuch bacha kar nahi rakhte.

## Second Brain (Tiago Forte)
Seekha: Capture -> Organize (PARA: Projects, Areas, Resources, Archive) -> Distill -> Express; "kaam ke hisaab se" rakho, "vishay ke hisaab se" nahi.
Apnaya: projects/notes/files + tags, status archive, saaransh (distill) JARVIS tabhi likhe jab Amit haan kahe (knowledge.second-brain L2), jawab mein source dikhana (express). Obsidian export plan.
Chhoda: poore PARA ke zabardasti folders, automatic tagging har note par (model kharch).


## LEAD correction 2026-11-11
Honcho license is AGPL-3.0 (checked on a secondary source; S22's department map said Apache-2.0 and was wrong). We copied no code, only ideas, so nothing to undo. Do NOT copy or link Honcho code into JARVIS. mem0 = Apache-2.0 per S22 map (not re-checked).
