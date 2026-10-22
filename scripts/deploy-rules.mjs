// firestore.rules を Firebase に反映する(GitHub Actions から動く)
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT が設定されていません');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });

const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const ruleset = await getSecurityRules().releaseFirestoreRulesetFromSource(source);
console.log(`ルールを反映しました:${ruleset.name}`);
