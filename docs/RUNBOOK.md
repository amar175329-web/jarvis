# RUNBOOK (S00) - जब कुछ गड़बड़ हो
| स्थिति | क्या करो |
|---|---|
| सब रोकना है | UI का Off बटन (kill switch)। वापस चालू: उसे फिर दबाओ। पुरानी queue वापस नहीं चलेगी (epoch बदल चुका है) |
| Supabase "paused" | Dashboard -> Restore project। फिर रोज़ की ping ठीक है या नहीं देखो |
| Key गलती से कहीं public हुई | उसी दिन rotate करो (docs: infra/secrets-plan.md), Vercel env बदलो, redeploy |
| check/CI fail | संदेश पढ़ो: वह ठीक वही फ़ाइल और नियम बताता है। `node scripts/check.ts` लोकल में चलाओ |
| Database भर रहा है (400 MB+) | `select public.purge_old_rows();` चलाओ, `select public.db_size_mb();` देखो, फिर बड़ी tables देखो (memories/embeddings) |
| Backup | Free plan में auto backup नहीं। हफ़्ते में एक बार: Supabase -> Database -> Backups/`pg_dump` या SQL Editor से export; फ़ाइल repo के बाहर रखो |
