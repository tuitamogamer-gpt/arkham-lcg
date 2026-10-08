// Original extraction of published names, identifiers and printed play modes.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { presentationRevision } from "./build-companion-presentation.mjs";
const campaignFiles = [
  "nightOfTheZealot",
  "theDunwichLegacy",
  "thePathToCarcosa",
  "theForgottenAge",
  "theCircleUndone",
  "theDreamEaters",
  "theInnsmouthConspiracy",
  "edgeOfTheEarth",
  "theScarletKeys",
  "theFeastOfHemlockVale",
  "theDrownedCity",
  "brethrenOfAsh",
  "childrenOfBlood",
  "side-stories",
];
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const development = (value) => ({
  ...(value?.beta === true ? { beta: true } : {}),
  ...(value?.alpha === true ? { alpha: true } : {}),
});
export async function buildCompanionOptions(
  source,
  destination,
  { extensionScenarios } = {},
) {
  const directory = resolve(source, "frontend/src/arkham/data");
  const rawCampaigns = JSON.parse(
    await readFile(resolve(directory, "campaigns.json"), "utf8"),
  );
  const campaigns = rawCampaigns.map(
    ({ id, name, returnTo, variants, beta, alpha }) => ({
      id,
      name,
      ...development({ beta, alpha }),
      ...(returnTo
        ? { returnTo: { id: returnTo.id, ...development(returnTo) } }
        : {}),
      ...(variants ? { variants: variants.map(({ key }) => ({ key })) } : {}),
    }),
  );
  const scenarios = [];
  for (const file of campaignFiles)
    for (const scenario of JSON.parse(
      await readFile(resolve(directory, `${file}.json`), "utf8"),
    )) {
      const common = {
        ...development(campaigns.find((c) => c.id === scenario.campaign)),
        ...development(scenario),
        ...(scenario.campaign ? { campaign: scenario.campaign } : {}),
        ...(scenario.standaloneDifficulties
          ? { standaloneDifficulties: scenario.standaloneDifficulties }
          : {}),
      };
      if (scenario.scenarios?.length) {
        if (
          scenario.campaign &&
          !campaigns.some((c) => c.id === scenario.campaign)
        )
          campaigns.push({
            id: scenario.campaign,
            name: scenario.name,
            ...development(scenario),
          });
        for (const part of scenario.scenarios)
          scenarios.push({
            id: part.id,
            name: part.name,
            ...common,
            ...development(part),
          });
      } else
        scenarios.push({ id: scenario.id, name: scenario.name, ...common });
      if (typeof scenario.returnTo === "string")
        scenarios.push({
          id: scenario.returnTo,
          name: scenario.returnToName || `Return to ${scenario.name}`,
          ...common,
        });
      if (scenario.returnToVariant)
        scenarios.push({
          id: scenario.id,
          name: "The Blob That Ate Everything ELSE!",
          variant: "blobElse",
          ...common,
        });
      if (scenario.miniCampaign)
        scenarios.push({
          id: scenario.id,
          name: `${scenario.name} · mini campaign`,
          variant: "mini",
          ...common,
        });
    }
  // Preserve the authored scenario already shipped in the play-options table.
  // Source data or a declared builder does not unlock its compiled capability.
  const authored =
    extensionScenarios ??
    JSON.parse(
      await readFile(
        resolve(project, "rules/extensions/barkham/frontend/scenarios.json"),
        "utf8",
      ),
    );
  for (const scenario of authored)
    if (
      !scenarios.some(
        (s) => s.id === scenario.id && s.variant === scenario.variant,
      )
    )
      scenarios.push({
        id: scenario.id,
        name: scenario.name,
        ...development(scenario),
        ...(scenario.campaign ? { campaign: scenario.campaign } : {}),
        ...(scenario.standaloneDifficulties
          ? { standaloneDifficulties: scenario.standaloneDifficulties }
          : {}),
      });
  const options = {
    sourceRevision: presentationRevision,
    campaigns,
    scenarios,
  };
  if (destination)
    await writeFile(destination, JSON.stringify(options, null, 2) + "\n");
  return options;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await buildCompanionOptions(
    resolve(
      process.env.ARKHAM_RULES_SOURCE ||
        "/private/tmp/arkham-upstream-research",
    ),
    resolve(project, "scripts/data/native-play-options.json"),
  );
  console.log(
    `Prepared ${result.campaigns.length} campaigns and ${result.scenarios.length} scenario play modes.`,
  );
}
