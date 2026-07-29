#!/usr/bin/env node
/* Fails the build when the app would ship without a database.
 *
 * `.env` is git-ignored, which is correct, and it means EAS Build never
 * receives it — the four EXPO_PUBLIC_* values have to come from EAS
 * environment variables instead. Miss that and nothing complains until the
 * app is on a phone: Expo inlines `undefined`, lib/supabase throws at module
 * load, and the APK dies on the splash screen with no clue why.
 *
 * So the check runs on the build server, where the failure is a red line in a
 * log next to the fix rather than a crash report from a tester.
 *
 * Wired to `eas-build-post-install`, which EAS runs after installing
 * dependencies and before bundling — early enough to save the build minutes.
 */

const REQUIRED = [
  ['EXPO_PUBLIC_SUPABASE_URL', 'the NewsStudio pipeline database (DB A)'],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'DB A publishable key'],
  ['EXPO_PUBLIC_CMS_URL', 'the DailyMattr CMS database (DB B)'],
  ['EXPO_PUBLIC_CMS_ANON_KEY', 'DB B publishable key'],
];

/* Nothing here may be secret. EXPO_PUBLIC_* is inlined into the bundle, so
   anything with this prefix is readable by anyone holding the APK — which is
   fine for a publishable key gated by RLS and catastrophic for a service-role
   one. Cheap to check, and the mistake is quiet if nobody does. */
const FORBIDDEN = ['EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SERVICE_ROLE_KEY'];

const missing = REQUIRED.filter(([name]) => !process.env[name]).map(
  ([name, what]) => `  ${name}  — ${what}`,
);
const leaked = FORBIDDEN.filter((name) => process.env[name]);

if (leaked.length) {
  console.error('\n✗ A service-role key is set with an EXPO_PUBLIC_ prefix:\n');
  for (const n of leaked) console.error(`  ${n}`);
  console.error('\nThat bypasses RLS and would ship inside the bundle. Remove it.\n');
  process.exit(1);
}

if (missing.length) {
  console.error('\n✗ Missing build-time configuration:\n');
  console.error(missing.join('\n'));
  console.error(
    '\nThese are inlined at build time, and .env is git-ignored so EAS never' +
      '\nsees it. Set them as EAS environment variables instead, for whichever' +
      '\nenvironment the profile names in eas.json:\n' +
      '\n  eas env:set --name EXPO_PUBLIC_CMS_URL --value https://….supabase.co \\' +
      '\n    --environment preview --visibility plaintext\n' +
      '\nThen list them with:  eas env:list --environment preview\n',
  );
  process.exit(1);
}

console.log('✓ Build-time configuration present (' + REQUIRED.length + ' values).');
