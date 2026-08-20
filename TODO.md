bugs to fix:
- Auto-updater disabled in src/lib/updater.ts (UPDATER_DISABLED). It trusted
  version.txt and the .msi on the network share with no signature/hash check —
  anyone who can write to that share could get an arbitrary installer opened
  on every office machine. Re-enable only after: publish a checksum/signature
  alongside version.txt, verify it before openPath(), and validate the
  version string format before it's used to build a path.

refactor:
- Camada de sync (useSyncBridge.ts + change-hub.ts) precisa split por
  bounded context + fix de coalescing no DBChangeHub. Diagnóstico completo
  e plano em SYNC_REFACTOR_PLAN.md.

features to add:
- small impact

- big impact

notes:
- Sync socket now requires VITE_SYNC_TOKEN (query-param auth on the WS
  upgrade, checked in src-tauri/src/lib.rs). Every office machine's .env
  needs the same value before its next build, or that device can't join
  the hub. See .env for the value currently in this checkout.
- gov_password is now encrypted at rest (AES-GCM, key derived from
  VITE_SYNC_TOKEN — see src/lib/crypto.ts). Old plaintext rows still read
  fine and get re-encrypted the next time that client is saved; no forced
  migration was run. cpf/cnpj stay plaintext on purpose — they're used in
  SQL equality lookups (duplicate checks).
