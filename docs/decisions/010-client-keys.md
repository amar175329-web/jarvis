# Master key never in clients
Status: Accepted (LEAD)

Decision: service_role only in api/ and worker/. app/ and android/ use anon key + Amit's login (RLS). check.ts fails the build if service_role appears in app/, android/ or features/. Offline phone queue uses expiry + kill_epoch, never trusts old commands.
