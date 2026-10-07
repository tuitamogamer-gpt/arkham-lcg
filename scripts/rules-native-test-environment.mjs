// Native behavior proofs must execute every example regardless of user Hspec configuration.
export function nativeTestEnvironment(environment) {
  return {
    ...Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith("HSPEC_"))),
    IGNORE_DOT_HSPEC: "1",
  };
}
