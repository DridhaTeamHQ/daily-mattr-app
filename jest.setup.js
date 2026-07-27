/* Native modules the pure-logic suite pulls in transitively.

   lib/persist.ts imports AsyncStorage at module scope — it has to, the
   persister is constructed there — so testing its allowlist means standing in
   for the native side. The package ships a mock for exactly this. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
