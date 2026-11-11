#!/bin/sh
# Install once:  cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
node scripts/register.ts && git add self/registry && node scripts/check.ts || { echo "Commit blocked by check (see above)."; exit 1; }
