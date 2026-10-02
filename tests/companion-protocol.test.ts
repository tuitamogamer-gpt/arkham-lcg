import test from "node:test";
import assert from "node:assert/strict";
import {
  companionQuestion,
  companionSnapshot,
  getCompanionQuestions,
  companionEntities,
  companionCatalogCode,
  companionText,
  companionFlavor,
  describeCompanionChoice,
  describeCompanionCost,
  buildChoiceAnswer,
  buildOrderedAnswer,
  buildAmountsAnswer,
  validateCompanionAmounts,
  buildDeckAnswer,
  buildDeckListAnswer,
  buildUpgradeDeckRequest,
  buildSettingsAnswer,
  buildScenarioSpecificAnswer,
  buildCampaignSpecificAnswer,
  buildExchangeAnswer,
  buildDestinyAnswer,
  buildCampaignStepAnswer,
  buildVentNoteRequest,
  decodeNativeQuestion,
  companionTranslator,
  companionContinuation,
  buildContinueAnswer,
  buildUpgradeStepAnswer,
  buildSideStoryAnswer,
  buildTravelAnswer,
  buildSpiritDeckAnswer,
  standaloneSettingsForAnswer,
  standaloneSettingsState,
  settingsCondition,
  settingsActive,
  relevantCampaignSettings,
  initialCampaignSettings,
  normalizeCampaignSettings,
  campaignSettingsForAnswer,
  type NativeGame,
} from "../src/game/companionProtocol";

const context = {
  card: (code: string) =>
    (
      ({
        "01001": { name: "Roland Banks" },
        "01016": { name: ".45 Automatic" },
        "barkham-001": { name: "Bark Harrigan" },
        "87005b": { name: "Tindalos" },
      }) as Record<string, { name: string }>
    )[code],
  translate: (key: string, variables: Readonly<Record<string, unknown>>) =>
    key === "test.amount" ? `Pay ${variables.count}` : undefined,
};
const game: NativeGame = {
  scenarioSteps: 17,
  activePlayerId: "seat-b",
  investigators: {
    "01001": {
      id: "01001",
      cardCode: "01001",
      name: { title: "Roland Banks", subtitle: "The Fed" },
    },
  },
  enemies: { e1: { id: "e1", cardCode: "01016", name: { title: "Ghoul" } } },
  cards: {
    c1: { tag: "PlayerCard", contents: { id: "c1", cardCode: "01016" } },
    hidden: {
      tag: "EncounterCard",
      contents: { id: "hidden", cardCode: "01016", facedown: true },
    },
  },
};
const model = (question: unknown) =>
  decodeNativeQuestion(question, { ...context, game, playerId: "seat-a" });
const labels = [
  { tag: "Label", label: "Use" },
  { tag: "Done", label: "Decline" },
];

test("native fetch identity never substitutes the active seat for the requesting seat", () => {
  const snapshot = companionSnapshot({
    playerId: "seat-a",
    investigatorIds: ["01001"],
    game: { ...game, id: "game-id" },
    step: 9,
  });
  assert.equal(snapshot.playerId, "seat-a");
  assert.equal(snapshot.step, 9);
  assert.deepEqual(snapshot.investigatorIds, ["01001"]);
  assert.equal(companionSnapshot(game).playerId, "");
  assert.throws(() => companionSnapshot(null), /invalid game/);
});
test("question wrappers preserve source, cost, narrative heading, and answer identity", () => {
  const q = model({
    tag: "QuestionLabel",
    label: "Choose your payment",
    card: "01016",
    question: {
      tag: "QuestionWithSource",
      source: { tag: "EnemySource", contents: "e1" },
      tooltip: "An enemy effect",
      question: {
        tag: "PayCostQuestion",
        cost: { tag: "ActionCost", contents: 1 },
        question: { tag: "ChooseOne", choices: labels },
      },
    },
  });
  assert.equal(q.title, "Choose your payment");
  assert.equal(q.cardCode, "01016");
  assert.deepEqual(q.costs, [{ tag: "ActionCost", contents: 1 }]);
  assert.deepEqual(buildChoiceAnswer(q, 1), {
    tag: "Answer",
    contents: { choice: 1, playerId: "seat-a", questionVersion: 17 },
  });
});
test("each pending seat remains a separate model", () => {
  const native = {
    ...game,
    question: {
      a: { tag: "ChooseOne", choices: labels },
      b: { tag: "Read", flavorText: { body: [] }, readChoices: [] },
    },
  };
  assert.deepEqual(
    getCompanionQuestions(native).map((q) => q.playerId),
    ["a", "b"],
  );
  assert.equal(companionQuestion(native, "absent"), undefined);
});
test("every ordinary choice-question tag retains its original indices and amount", () => {
  for (const tag of [
    "ChooseOne",
    "PlayerWindowChooseOne",
    "WindowChooseOne",
    "ChooseN",
    "ChooseSome",
    "ChooseSome1",
    "ChooseUpToN",
    "ChooseOneAtATime",
    "PickSupplies",
  ]) {
    const q = model({
      tag,
      amount: 2,
      pointsRemaining: 4,
      chosenSupplies: ["Rope"],
      resupply: true,
      choices: labels,
    });
    assert.equal(q.kind, "choices", tag);
    assert.deepEqual(
      q.choices.map((v) => v.answerIndex),
      [0, 1],
      tag,
    );
    assert.equal(q.amount, 2);
    assert.equal(q.isPlayerWindow, tag === "PlayerWindowChooseOne");
    assert.equal(q.isWindow, tag === "WindowChooseOne");
    if (tag === "PickSupplies") {
      assert.equal(q.pointsRemaining, 4);
      assert.deepEqual(q.chosenSupplies, ["Rope"]);
      assert.equal(q.resupply, true);
    }
  }
});
test("one-from-each flattens the native groups without losing their boundaries", () => {
  const q = model({ tag: "ChooseOneFromEach", groups: [[labels[0]], labels] });
  assert.deepEqual(
    q.choices.map((v) => [v.answerIndex, v.group]),
    [
      [0, 0],
      [1, 1],
      [2, 1],
    ],
  );
  assert.equal(
    (buildChoiceAnswer(q, 2).contents as { choice: number }).choice,
    2,
  );
});
test("auto ordering has a synthetic index-zero choice while OrderedAnswer uses real zero-based indices", () => {
  const q = model({
    tag: "ChooseOneAtATimeWithAuto",
    label: "Resolve automatically",
    choices: labels,
  });
  assert.deepEqual(
    q.choices.map((v) => v.answerIndex),
    [0, 1, 2],
  );
  assert.equal(
    (buildChoiceAnswer(q, 2).contents as { choice: number }).choice,
    2,
  );
  assert.deepEqual(buildOrderedAnswer(q, [1, 0]), {
    tag: "OrderedAnswer",
    contents: { choices: [1, 0], playerId: "seat-a", questionVersion: 17 },
  });
  assert.throws(() => buildOrderedAnswer(q, [0, 0]), /exactly once/);
  assert.throws(() => buildOrderedAnswer(q, [0]), /exactly once/);
  assert.throws(
    () =>
      buildOrderedAnswer(model({ tag: "ChooseOne", choices: labels }), [0, 1]),
    /cannot/,
  );
});
test("put-back order describes the actual native bottom-first operation", () => {
  const q = model({
    tag: "ChooseOneAtATime",
    choices: labels.map((v) => ({
      ...v,
      messages: [{ tag: "AddFocusedToTopOfDeck" }],
    })),
  });
  assert.equal(q.orderDirection, "bottom-first");
});
test("all four Read forms retain counts and flavor without inventing a continue button", () => {
  const flavorText = {
    title: "An encounter",
    body: [{ tag: "BasicEntry", text: "Something stirs." }],
  };
  for (const readChoices of [
    labels,
    { tag: "BasicReadChoices", contents: labels },
    { tag: "LeadInvestigatorMustDecide", contents: labels },
    { tag: "BasicReadChoicesN", contents: [2, labels] },
    { tag: "BasicReadChoicesUpToN", contents: [2, labels] },
  ]) {
    const q = model({
      tag: "Read",
      readChoices,
      flavorText,
      readCards: ["01016"],
    });
    assert.equal(q.choices.length, 2);
    assert.equal(q.flavor?.entries[0].text, "Something stirs.");
    assert.deepEqual(q.readCards, ["01016"]);
  }
  assert.equal(
    model({ tag: "Read", readChoices: [], flavorText }).choices.length,
    0,
  );
});
test("wizard previews and dropdown replies retain their native choice indices", () => {
  const wizard = model({
    tag: "ChooseOneWizard",
    flavorText: { body: [] },
    wizardChoices: [
      {
        label: "The path",
        flavorText: { body: [{ tag: "BasicEntry", text: "Preview." }] },
      },
    ],
  });
  assert.equal(wizard.choices[0].flavor?.entries[0].text, "Preview.");
  const dropdown = model({
    tag: "DropDown",
    options: [
      ["First", { tag: "Noop" }],
      ["Second", { tag: "Noop" }],
    ],
  });
  assert.equal(dropdown.choices[1].label, "Second");
  assert.equal(
    (buildChoiceAnswer(dropdown, 1).contents as { choice: number }).choice,
    1,
  );
});
test("unknown and non-actionable UI labels cannot become valid decisions", () => {
  const q = model({
    tag: "ChooseOne",
    choices: [
      { tag: "InvalidLabel", label: "Cannot pay" },
      { tag: "Info", flavor: { body: [] } },
      { tag: "FutureLabel" },
      labels[0],
    ],
  });
  for (const index of [0, 1, 2, -1, 4, 0.5])
    assert.throws(() => buildChoiceAnswer(q, index), /available option/);
  assert.equal(model({ tag: "FutureQuestion" }).kind, "unsupported");
});
test("entity targets and card namespaces resolve printed names without revealing facedown identities", () => {
  assert.equal(
    describeCompanionChoice(
      { tag: "TargetLabel", target: { tag: "CardIdTarget", contents: "c1" } },
      game,
      context,
    ).label,
    ".45 Automatic",
  );
  const hidden = describeCompanionChoice(
    { tag: "TargetLabel", target: { tag: "CardIdTarget", contents: "hidden" } },
    game,
    context,
  );
  assert.equal(hidden.label, "Facedown card");
  assert.equal(hidden.cardCode, undefined);
  assert.equal(
    describeCompanionChoice(
      { tag: "CardLabel", cardCode: "c:barkham:001" },
      game,
      context,
    ).label,
    "Bark Harrigan",
  );
  assert.equal(companionCatalogCode("87005b"), "87005b");
  assert.equal(companionEntities(game, "cards")[0].id, "c1");
});
test("all native UI label tags have deliberate display support", () => {
  const fixtures = [
    ...labels,
    { tag: "TooltipLabel", label: "Use", tooltip: "A tooltip" },
    { tag: "ScenarioLabel", label: "Scenario" },
    { tag: "CostLabel", cost: { tag: "Free" } },
    { tag: "CardLabel", cardCode: "01016" },
    { tag: "PortraitLabel", investigatorId: "01001" },
    { tag: "TargetLabel", target: { tag: "EnemyTarget", contents: "e1" } },
    { tag: "ChaosTokenLabel", face: "MinusTwo" },
    { tag: "KeyLabel", key: "RedKey" },
    { tag: "SkillLabel", skillType: "SkillCombat" },
    { tag: "SkillLabelWithLabel", skillType: "SkillCombat", label: "Combat" },
    ...[
      "FightLabel",
      "FightLabelWithSkill",
      "EvadeLabel",
      "EvadeLabelWithSkill",
      "EngageLabel",
    ].map((tag) => ({ tag, enemyId: "e1", skillType: "SkillAgility" })),
    { tag: "GridLabel", gridLabel: "A1" },
    { tag: "ConnectionLabel", connection: "Circle" },
    { tag: "TarotLabel", tarotCard: { arcana: "TheFool" } },
    {
      tag: "AbilityLabel",
      ability: {
        source: { tag: "InvestigatorSource", contents: "01001" },
        type: { tag: "ReactionAbility", cost: { tag: "Free" } },
        index: 1,
      },
    },
    {
      tag: "ComponentLabel",
      component: {
        tag: "InvestigatorComponent",
        investigatorId: "01001",
        tokenType: "ClueToken",
      },
    },
    {
      tag: "AuxiliaryComponentLabel",
      component: {
        tag: "AssetComponent",
        assetId: "c1",
        tokenType: "HorrorToken",
      },
    },
    ...[
      "EndTurnButton",
      "StartSkillTestButton",
      "SkillTestApplyResultsButton",
      "SkipTriggersButton",
    ].map((tag) => ({ tag, investigatorId: "01001" })),
    { tag: "EffectActionButton", effectId: "effect", tooltip: "Resolve" },
    { tag: "ChaosTokenGroupChoice", step: {} },
    { tag: "CardPile", pile: [{ cardId: "c1" }] },
  ];
  for (const fixture of fixtures) {
    const described = describeCompanionChoice(fixture, game, context);
    assert.ok(described.label, fixture.tag);
    assert.equal(described.disabled, false, fixture.tag);
  }
});
test("proxied abilities identify the actual source, reaction, cost and printed tooltip", () => {
  const choice = describeCompanionChoice(
    {
      tag: "AbilityLabel",
      ability: {
        source: {
          tag: "ProxySource",
          source: {
            tag: "AbilitySource",
            contents: [{ tag: "InvestigatorSource", contents: "01001" }, 2],
          },
        },
        tooltip: "$test.amount count=2",
        type: {
          tag: "Objective",
          abilityType: {
            tag: "ReactionAbility",
            cost: { tag: "ResourceCost", contents: 2 },
          },
        },
      },
    },
    game,
    context,
  );
  assert.match(choice.label, /Roland Banks.*Reaction/);
  assert.equal(choice.detail, "Pay 2");
  assert.deepEqual(choice.cost, { tag: "ResourceCost", contents: 2 });
});
test("investigator component choices describe actual resource and draw messages", () => {
  const component = {
    tag: "InvestigatorComponent",
    investigatorId: "01001",
    tokenType: "ResourceToken",
  };
  const take = describeCompanionChoice(
    {
      tag: "ComponentLabel",
      component,
      messages: [
        {
          tag: "TakeResources",
          contents: [
            "01001",
            1,
            { tag: "ResourceSource", contents: "01001" },
            true,
          ],
        },
      ],
    },
    game,
    context,
  );
  assert.equal(take.label, "Take 1 resource");
  assert.equal(take.detail, "Roland Banks — The Fed · Resource action");
  const spend = describeCompanionChoice(
    {
      tag: "ComponentLabel",
      component,
      messages: [
        {
          tag: "Do",
          contents: { tag: "SpendResources", contents: ["01001", 2] },
        },
      ],
    },
    game,
    context,
  );
  assert.equal(spend.label, "Spend 2 resources");
  const draw = describeCompanionChoice(
    {
      tag: "ComponentLabel",
      component: { tag: "InvestigatorDeckComponent", investigatorId: "01001" },
      messages: [
        {
          tag: "DrawCards",
          contents: ["01001", { cardDrawAmount: 1, cardDrawAction: true }],
        },
      ],
    },
    game,
    context,
  );
  assert.equal(draw.label, "Draw 1 card");
  assert.match(draw.detail ?? "", /Draw action/);
});
test("component labels do not invent resource or draw actions from token icons or another investigator's messages", () => {
  const original = {
    tag: "ComponentLabel",
    component: {
      tag: "InvestigatorComponent",
      investigatorId: "01001",
      tokenType: "ResourceToken",
    },
  };
  assert.match(
    describeCompanionChoice(original, game, context).label,
    /Roland Banks/,
  );
  const mismatch = describeCompanionChoice(
    {
      ...original,
      messages: [{ tag: "TakeResources", contents: ["01002", 1, null, true] }],
    },
    game,
    context,
  );
  assert.doesNotMatch(mismatch.label, /Take/);
  const bonus = describeCompanionChoice(
    {
      ...original,
      messages: [{ tag: "TakeResources", contents: ["01001", 3, null, false] }],
    },
    game,
    context,
  );
  assert.equal(bonus.label, "Take 3 resources");
  assert.doesNotMatch(bonus.detail ?? "", /Resource action/);
});
test("native basic ability constants retain meaningful action labels and exact printed costs", () => {
  const native = {
    ...game,
    locations: { l1: { id: "l1", name: { title: "Study" } } },
  };
  for (const [index, action] of [
    [103, "Investigate"],
    [104, "Move to"],
  ] as const) {
    const described = describeCompanionChoice(
      {
        tag: "AbilityLabel",
        ability: {
          source: { tag: "LocationSource", contents: "l1" },
          index,
          basic: true,
          type: {
            tag: "ActionAbility",
            cost: { tag: "ActionCost", contents: 2 },
          },
        },
      },
      native,
      context,
    );
    assert.equal(described.label, `${action} Study`);
    assert.equal(described.detail, "Study");
    assert.deepEqual(described.cost, { tag: "ActionCost", contents: 2 });
  }
  for (const [index, action] of [
    [100, "Fight"],
    [101, "Evade"],
    [102, "Engage"],
  ] as const) {
    const described = describeCompanionChoice(
      {
        tag: "AbilityLabel",
        ability: {
          source: { tag: "EnemySource", contents: "e1" },
          index,
          basic: true,
          type: { tag: "ActionAbility" },
        },
      },
      native,
      context,
    );
    assert.equal(described.label, `${action} Ghoul`);
  }
});
test("custom abilities cannot be mistaken for basic actions by a coinciding index", () => {
  for (const ability of [
    {
      source: { tag: "LocationSource", contents: "l1" },
      index: 104,
      basic: false,
    },
    {
      source: { tag: "InvestigatorSource", contents: "01001" },
      index: 104,
      basic: true,
    },
  ]) {
    const described = describeCompanionChoice(
      {
        tag: "AbilityLabel",
        ability: { ...ability, type: { tag: "ActionAbility" } },
      },
      game,
      context,
    );
    assert.doesNotMatch(described.label, /Move/);
  }
});
test("narrative preserves headings, columns, lists, modifiers, cards, tarot and chaos tokens", () => {
  const flavor = companionFlavor(
    {
      title: "$test.amount count=1",
      body: [
        {
          tag: "HeaderEntry",
          key: "test.amount",
          variables: { count: 3 },
          level: 2,
        },
        {
          tag: "ColumnEntry",
          entries: [
            {
              tag: "ModifyEntry",
              modifiers: ["RedEntry"],
              entry: { tag: "BasicEntry", text: "Red" },
            },
          ],
        },
        {
          tag: "ListEntry",
          list: [
            {
              entry: { tag: "CardEntry", cardCode: "01016" },
              nested: [
                { entry: { tag: "TarotEntry", tarot: "TheFool" }, nested: [] },
              ],
            },
          ],
        },
        { tag: "ChaosTokenEntry", chaosTokenFace: "ElderSign" },
        { tag: "ChaosTokenMorphEntry", morphFrom: "Zero", morphTo: "MinusOne" },
        { tag: "EntrySplit" },
      ],
    },
    context,
  );
  assert.equal(flavor.title, "Pay 1");
  assert.equal(flavor.entries[0].text, "Pay 3");
  assert.deepEqual(flavor.entries[1].children?.[0].modifiers, ["RedEntry"]);
  assert.equal(flavor.entries[3].text, "Elder sign");
  assert.equal(flavor.entries[4].text, "0 → −1");
  assert.equal(flavor.entries[5].tag, "EntrySplit");
});
test("missing translations are explicit, and uncommon costs retain their actual data", () => {
  assert.equal(companionText("$unknown.key", context), "[unknown.key]");
  assert.equal(companionText("Do a thing", context), "Do a thing");
  assert.match(
    describeCompanionCost({ tag: "SomeNewCost", contents: [2, "Rare"] }),
    /Some New.*2.*Rare/,
  );
  assert.equal(
    describeCompanionCost({
      tag: "Costs",
      contents: [
        { tag: "ActionCost", contents: 1 },
        { tag: "ResourceCost", contents: 2 },
      ],
    }),
    "1 action, 2 resources",
  );
});
const amounts = (
  tag = "ChooseAmounts",
  target: unknown = { tag: "TotalAmountTarget", contents: 2 },
) =>
  model({
    tag,
    amountTargetValue: target,
    paymentAmountTargetValue: target,
    amountChoices: [
      { choiceId: "uuid-a", label: "A", minBound: 0, maxBound: 2 },
      { choiceId: "uuid-b", label: "B", minBound: 0, maxBound: 2 },
    ],
  });
test("amount replies retain native UUIDs, zero rows, explicit seat and question version", () => {
  const q = amounts();
  assert.deepEqual(buildAmountsAnswer(q, { "uuid-a": 2 }), {
    tag: "AmountsAnswer",
    contents: {
      amounts: { "uuid-a": 2, "uuid-b": 0 },
      playerId: "seat-a",
      questionVersion: 17,
    },
  });
  assert.equal(
    buildAmountsAnswer(amounts("ChoosePaymentAmounts"), { "uuid-b": 2 }).tag,
    "PaymentAmountsAnswer",
  );
});
test("amount validation enforces bounds, integer values, every target type, and zero totals", () => {
  for (const value of [
    { "uuid-a": -1 },
    { "uuid-a": 3 },
    { "uuid-a": 1.5 },
    { unrelated: 2 },
    { "uuid-a": 1 },
  ] as Record<string, number>[])
    assert.ok(validateCompanionAmounts(amounts(), value));
  assert.equal(
    validateCompanionAmounts(
      amounts("ChooseAmounts", { tag: "TotalAmountTarget", contents: 0 }),
      {},
    ),
    undefined,
  );
  assert.ok(
    validateCompanionAmounts(
      amounts("ChooseAmounts", { tag: "TotalAmountTarget", contents: 0 }),
      { "uuid-a": 1 },
    ),
  );
  assert.ok(
    validateCompanionAmounts(
      amounts("ChooseAmounts", { tag: "MaxAmountTarget", contents: 0 }),
      { "uuid-a": 1 },
    ),
  );
  assert.ok(
    validateCompanionAmounts(
      amounts("ChooseAmounts", { tag: "MinAmountTarget", contents: 1 }),
      {},
    ),
  );
  assert.ok(
    validateCompanionAmounts(
      amounts("ChooseAmounts", { tag: "AmountOneOf", contents: [1, 3] }),
      { "uuid-a": 2 },
    ),
  );
});
test("deck selection and upgrading use distinct native endpoints and retain join restrictions", () => {
  const q = model({ tag: "ChooseJoinDeck", usedInvestigators: ["01001"] });
  assert.deepEqual(q.usedInvestigators, ["01001"]);
  assert.deepEqual(buildDeckAnswer(q, "deck-id"), {
    tag: "DeckAnswer",
    deckId: "deck-id",
    playerId: "seat-a",
    overlay: null,
  });
  assert.equal(
    buildDeckListAnswer(q, {
      investigator_code: "01001",
      slots: { "01016": 2 },
    }).tag,
    "DeckListAnswer",
  );
  const upgrade = model({ tag: "ChooseUpgradeDeck" });
  assert.deepEqual(buildUpgradeDeckRequest(upgrade, "01001"), {
    investigatorId: "01001",
  });
  assert.throws(() => buildDeckAnswer(upgrade, "deck-id"), /does not accept/);
});
test("settings and specialized answers retain the actual native payload shapes", () => {
  assert.deepEqual(
    buildSettingsAnswer(model({ tag: "PickScenarioSettings" }), []),
    { tag: "StandaloneSettingsAnswer", contents: [] },
  );
  assert.deepEqual(
    buildSettingsAnswer(model({ tag: "PickCampaignSettings" }), {
      keys: [],
      counts: [],
      sets: [],
      options: [],
    }).tag,
    "CampaignSettingsAnswer",
  );
  assert.throws(
    () => buildSettingsAnswer(model({ tag: "PickCampaignSettings" }), {}),
    /need keys/,
  );
  const scenario = model({
    tag: "PickScenarioSpecific",
    contents: ["chooseResearch", { points: 3 }],
  });
  assert.equal(scenario.specific?.key, "chooseResearch");
  assert.deepEqual(buildScenarioSpecificAnswer(scenario, [1, 2]), {
    tag: "ScenarioSpecificAnswer",
    contents: ["chooseResearch", [1, 2]],
  });
  assert.deepEqual(
    buildCampaignSpecificAnswer(
      model({ tag: "PickCampaignSpecific", contents: ["map", {}] }),
      "London",
    ),
    { tag: "CampaignSpecificAnswer", contents: ["map", "London"] },
  );
});
test("exchange answers preserve signed direction without allowing token overspending", () => {
  const q = model({
    tag: "ChooseExchangeAmounts",
    investigator1Id: "01001",
    investigator2Id: "01002",
    investigator1InitialAmount: 2,
    investigator2InitialAmount: 3,
    source: { tag: "StorySource", contents: "70033" },
    token: "Clue",
  });
  assert.equal(buildExchangeAnswer(q, -3).amount, -3);
  assert.equal(buildExchangeAnswer(q, 2).fromInvestigator, "01001");
  for (const n of [-4, 3, 0.5])
    assert.throws(() => buildExchangeAnswer(q, n), /can pay/);
});
test("destiny rotates exactly half the cards and preserves their original scenarios", () => {
  const a = { scenario: "a", tarot: { arcana: "TheFool0", facing: "Upright" } },
    b = { scenario: "b", tarot: { arcana: "TheTowerXVI", facing: "Upright" } };
  const q = model({ tag: "PickDestiny", drawings: [a, b] });
  assert.equal(
    buildDestinyAnswer(q, [
      { ...a, tarot: { ...a.tarot, facing: "Reversed" } },
      b,
    ]).tag,
    "PickDestinyAnswer",
  );
  assert.throws(
    () =>
      buildDestinyAnswer(q, [
        { ...a, tarot: b.tarot },
        { ...b, tarot: a.tarot },
      ]),
    /Keep the drawn/,
  );
  assert.throws(() => buildDestinyAnswer(q, [a, b]), /Turn exactly/);
  assert.equal(
    buildCampaignStepAnswer(model({ tag: "ContinueCampaign" }), {
      tag: "ScenarioStep",
      contents: "01002",
    }).tag,
    "CampaignStepAnswer",
  );
});
test("a private Vent note targets its original story and investigator", () => {
  const q = model({
    tag: "PickScenarioSpecific",
    contents: ["epicLabyrinth.note", { story: "70035", investigator: "01001" }],
  });
  assert.deepEqual(buildVentNoteRequest(q, "A clue"), {
    playerId: "seat-a",
    questionVersion: 17,
    storyId: "70035",
    investigatorId: "01001",
    text: "A clue",
  });
  assert.throws(
    () =>
      buildVentNoteRequest(
        model({ tag: "PickScenarioSpecific", contents: ["other", {}] }),
        "Text",
      ),
    /does not request/,
  );
});

test("native typed translation parameters support quoted names, escaped quotes and counts", () => {
  const translate = companionTranslator({
    say: "{name}: {count}",
    hello: "Hello",
  });
  assert.equal(
    companionText('$say name=s:"A \\"quoted\\" dog" count=i:2', { translate }),
    'A "quoted" dog: 2',
  );
  assert.equal(
    companionText("Before $hello after", { translate }),
    "Before Hello after",
  );
  assert.equal(
    companionText('$say __name=s:"01001" name=s:"placeholder" count=i:3', {
      ...context,
      translate,
    }),
    "Roland Banks: 3",
  );
});
test("settings schemas resolve by actual scenario and campaign identities", () => {
  const scenario = [{ type: "ToggleKey", key: "Test", content: false }],
    campaign = [{ key: "Past", settings: [] }];
  const ctx = {
    ...context,
    scenarioSettings: (id: string) => (id === "87001" ? scenario : undefined),
    campaignSettings: (id: string) => (id === "02" ? campaign : undefined),
  };
  assert.deepEqual(
    companionQuestion(
      {
        ...game,
        scenario: { id: "c87001" },
        question: { a: { tag: "PickScenarioSettings" } },
      },
      "a",
      ctx,
    )?.settings,
    scenario,
  );
  assert.deepEqual(
    companionQuestion(
      {
        ...game,
        campaign: { id: "02" },
        question: { a: { tag: "PickCampaignSettings" } },
      },
      "a",
      ctx,
    )?.settings,
    campaign,
  );
});
test("campaign local objects normalize to the exact native pair-array wire", () => {
  const q = model({ tag: "PickCampaignSettings" });
  assert.deepEqual(
    buildSettingsAnswer(q, {
      keys: [{ key: "Saved", scope: "Past" }],
      counts: { Doubt: 2 },
      sets: {
        People: {
          recordable: "RecordableCardCode",
          entries: [{ tag: "Recorded", value: "01001" }],
        },
      },
      options: [{ key: "Display", ckey: "TakeAlly" }],
    }),
    {
      tag: "CampaignSettingsAnswer",
      contents: {
        keys: ["Saved"],
        counts: [["Doubt", 2]],
        sets: [
          [
            "People",
            {
              recordable: "RecordableCardCode",
              entries: [{ tag: "Recorded", value: "01001" }],
            },
          ],
        ],
        options: ["TakeAlly"],
      },
    },
  );
});
test("standalone branching filters nested inactive records while preserving printed values", () => {
  const schema = [
    { type: "ToggleOption", key: "Extra", content: false },
    {
      type: "Group",
      key: "Group",
      content: [
        { type: "ChooseNum", key: "Doubt", content: 2, min: 0, max: 3 },
        {
          type: "ToggleKey",
          key: "Hidden",
          content: true,
          ifRecorded: [{ type: "option", key: "Extra" }],
        },
      ],
    },
    {
      type: "ToggleRecords",
      key: "People",
      recordable: "RecordableCardCode",
      content: [
        { key: "01001", content: true },
        {
          key: "01002",
          content: false,
          ifRecorded: [{ type: "option", key: "Extra" }],
        },
      ],
    },
  ];
  const filtered = standaloneSettingsForAnswer(schema) as typeof schema;
  assert.equal(
    filtered[1].content instanceof Array && filtered[1].content.length,
    1,
  );
  assert.equal(
    filtered[2].content instanceof Array && filtered[2].content.length,
    1,
  );
  assert.equal(
    settingsCondition(
      { type: "inSet", key: "People", content: "01001" },
      standaloneSettingsState(schema),
    ),
    true,
  );
  assert.throws(
    () =>
      standaloneSettingsForAnswer([
        { type: "ChooseNum", key: "Doubt", content: 4, min: 0, max: 3 },
      ]),
    /printed bounds/,
  );
  assert.deepEqual(
    standaloneSettingsForAnswer([
      {
        type: "ChooseRecord",
        key: "People",
        recordable: "RecordableCardCode",
        selected: "01001",
        content: [{ key: "01001" }],
      },
    ])[0],
    {
      type: "ChooseRecord",
      key: "People",
      recordable: "RecordableCardCode",
      selected: "01001",
      content: [{ key: "01001" }],
    },
  );
});
test("settings conditions distinguish recorded, crossed out, count and logical branches", () => {
  const state = {
    keys: [{ key: "Saved", scope: "Past" }],
    counts: { Doubt: 2 },
    sets: {
      People: {
        recordable: "RecordableCardCode",
        entries: [{ tag: "CrossedOut" as const, value: "01001" }],
      },
    },
    options: [{ key: "Ally" }],
  };
  assert.equal(
    settingsCondition(
      { type: "inSet", key: "People", content: "01001" },
      state,
    ),
    false,
  );
  assert.equal(
    settingsCondition(
      { type: "crossedOut", key: "People", content: "01001" },
      state,
    ),
    true,
  );
  assert.equal(
    settingsCondition(
      {
        type: "and",
        content: [
          { type: "key", key: "Saved", scope: "Past" },
          { type: "count", key: "Doubt", predicate: { type: "lte", value: 2 } },
        ],
      },
      state,
    ),
    true,
  );
  assert.equal(
    settingsCondition(
      { type: "nor", content: [{ type: "option", key: "Ally" }] },
      state,
    ),
    false,
  );
  assert.equal(
    settingsActive(
      {
        anyRecorded: [
          { type: "key", key: "Missing" },
          { type: "key", key: "Saved" },
        ],
      },
      state,
    ),
    true,
  );
});
test("campaign forms include only earlier scenarios and the selected scenario's forced section", () => {
  const schema = [
    { key: "First", scenarioId: "02041", settings: [] },
    { key: "Current", scenarioId: "02062", settings: [] },
    { key: "Forced", force: { scenarioId: "02062" }, settings: [] },
    { key: "Future", scenarioId: "02118", settings: [] },
  ];
  assert.deepEqual(
    relevantCampaignSettings(schema, {
      campaign: { step: { tag: "ScenarioStep", contents: "c02062" } },
    }).map((v) => v.key),
    ["First", "Forced"],
  );
});
test("campaign records enforce forced branches and remove stale records after a choice changes", () => {
  const schema = [
    {
      key: "Past",
      settings: [
        {
          type: "ChooseKey",
          key: "Choice",
          content: [{ key: "Saved" }, { key: "Lost" }],
        },
        {
          type: "ForceRecorded",
          key: "Name",
          ckey: "People",
          recordable: "RecordableCardCode",
          content: "01001",
          ifRecorded: [{ type: "key", key: "Saved" }],
        },
        {
          type: "ChooseKey",
          key: "Outcome",
          content: [
            { key: "Must", forceWhen: { type: "key", key: "Saved" } },
            { key: "Other" },
          ],
        },
        { type: "ChooseNum", key: "Doubt", ckey: "Doubt", min: 0, max: 3 },
      ],
    },
  ];
  const state = initialCampaignSettings(schema);
  state.keys = [
    { key: "Saved", scope: "Past" },
    { key: "Other", scope: "Past" },
  ];
  const normalized = normalizeCampaignSettings(schema, state);
  assert.deepEqual(normalized.keys, [
    { key: "Saved", scope: "Past" },
    { key: "Must", scope: "Past" },
  ]);
  assert.equal(normalized.sets.People.entries[0].value, "01001");
  assert.deepEqual(campaignSettingsForAnswer(schema, normalized).counts, [
    ["Doubt", 0],
  ]);
  state.keys = [
    { key: "Lost", scope: "Past" },
    { key: "Other", scope: "Past" },
  ];
  state.sets = normalized.sets;
  assert.equal(normalizeCampaignSettings(schema, state).sets.People, undefined);
  assert.throws(
    () => campaignSettingsForAnswer(schema, initialCampaignSettings(schema)),
    /Choose Choice/,
  );
});
test("spirit deck selection enforces the distinct printed count and original card identities", () => {
  const q = model({
    tag: "PickScenarioSpecific",
    contents: [
      "laidToRest.buildSpiritDeck",
      { cardCodes: ["a", "b", "c"], fixed: ["f"], count: 2 },
    ],
  });
  assert.deepEqual(buildSpiritDeckAnswer(q, ["c", "a"]), {
    tag: "ScenarioSpecificAnswer",
    contents: ["laidToRest.buildSpiritDeck", { cardCodes: ["c", "a"] }],
  });
  for (const values of [["a"], ["a", "a"], ["a", "f"]])
    assert.throws(
      () => buildSpiritDeckAnswer(q, values),
      /exactly 2 different/,
    );
});
test("Scarlet Keys travel sends the exact three operation keys and checks tickets/unlocks", () => {
  const q = model({
    tag: "PickCampaignSpecific",
    contents: [
      "embark",
      {
        current: "London",
        hasTicket: true,
        available: ["Venice"],
        locations: [
          ["Venice", { travel: 1 }],
          ["Rome", { travel: 2 }],
          ["London", { travel: 0 }],
        ],
      },
    ],
  });
  assert.deepEqual(buildTravelAnswer(q, "Venice", "travelWithTicket"), {
    tag: "CampaignSpecificAnswer",
    contents: ["travelWithTicket", "Venice"],
  });
  assert.equal(
    (buildTravelAnswer(q, "Rome", "travelVia").contents as unknown[])[0],
    "travelVia",
  );
  assert.throws(() => buildTravelAnswer(q, "Rome", "travel"), /unlocked/);
  assert.throws(() => buildTravelAnswer(q, "London", "travelVia"), /already/);
  assert.throws(
    () => buildTravelAnswer(q, "Unknown", "travel"),
    /destination on this map/,
  );
});
test("Vent note request rejects oversized text and never emits an arbitrary native message", () => {
  const q = model({
    tag: "PickScenarioSpecific",
    contents: ["epicLabyrinth.note", { story: "70035", investigator: "01001" }],
  });
  assert.equal(buildVentNoteRequest(q, "text").tag, undefined);
  assert.throws(() => buildVentNoteRequest(q, "x".repeat(4001)), /too long/);
});

test("campaign continuation preserves native mandatory scenario options and nested return steps", () => {
  const raw = {
    tag: "ContinueCampaignStep",
    contents: {
      nextStep: { tag: "ScenarioStep", contents: "c02062" },
      canUpgradeDecks: true,
      canChooseSideStory: true,
    },
  };
  const q = companionQuestion(
    {
      ...game,
      campaign: { step: raw },
      question: { "seat-a": { tag: "ContinueCampaign" } },
    },
    "seat-a",
  )!;
  assert.equal(
    (companionContinuation(q).nextStep as { tag: string }).tag,
    "ScenarioStep",
  );
  assert.deepEqual(buildContinueAnswer(q, "01001"), {
    tag: "CampaignStepAnswer",
    contents: {
      tag: "ScenarioStepWithOptions",
      contents: [
        "c02062",
        {
          scenarioOptionsStandalone: false,
          scenarioOptionsPerformTarotReading: false,
          scenarioOptionsLeadInvestigator: "01001",
        },
      ],
    },
  });
  assert.equal(
    (buildUpgradeStepAnswer(q).contents as { tag: string }).tag,
    "UpgradeDeckStep",
  );
  const side = buildSideStoryAnswer(q, "81001").contents as {
    contents: { nextStep: { contents: unknown[] } };
  };
  assert.equal(side.contents.nextStep.contents[0], "81001");
  assert.deepEqual(
    (side.contents.nextStep.contents[1] as { contents: { nextStep: unknown } })
      .contents.nextStep,
    raw.contents.nextStep,
  );
  assert.throws(
    () => buildSideStoryAnswer(model({ tag: "ContinueCampaign" }), "81001"),
    /not offered/,
  );
});
test("existing scenario tarot/setup options survive changing only the lead investigator", () => {
  const next = {
    tag: "ScenarioStepWithOptions",
    contents: [
      "c02062",
      {
        scenarioOptionsStandalone: true,
        scenarioOptionsPerformTarotReading: true,
        scenarioOptionsSkipStartOfGame: true,
      },
    ],
  };
  const q = companionQuestion(
    {
      ...game,
      campaign: {
        step: { tag: "ContinueCampaignStep", contents: { nextStep: next } },
      },
      question: { "seat-a": { tag: "ContinueCampaign" } },
    },
    "seat-a",
  )!;
  const result = buildContinueAnswer(q, "01002").contents as {
    contents: [string, Record<string, unknown>];
  };
  assert.deepEqual(result.contents[1], {
    scenarioOptionsStandalone: true,
    scenarioOptionsPerformTarotReading: true,
    scenarioOptionsSkipStartOfGame: true,
    scenarioOptionsLeadInvestigator: "01002",
  });
});
test("decision components render typed controls for every native question family without submitting", async () => {
  const { createElement } = await import("react"),
    { renderToStaticMarkup } = await import("react-dom/server");
  const { CompanionDecision } =
    await import("../src/components/CompanionDecision");
  let submissions = 0;
  const ctx = {
    ...context,
    scenarioSettings: () => [],
    campaignSettings: () => [],
  };
  const cases: [unknown, RegExp][] = [
    [{ tag: "ChooseOne", choices: labels }, /Use/],
    [
      {
        tag: "PlayerWindowChooseOne",
        choices: [
          {
            tag: "ComponentLabel",
            component: {
              tag: "InvestigatorComponent",
              investigatorId: "01001",
              tokenType: "ResourceToken",
            },
            messages: [
              { tag: "TakeResources", contents: ["01001", 1, null, true] },
            ],
          },
        ],
      },
      /Take 1 resource/,
    ],
    [
      {
        tag: "Read",
        flavorText: { body: [{ tag: "BasicEntry", text: "Story text" }] },
        readChoices: { tag: "BasicReadChoices", contents: labels },
      },
      /Story text/,
    ],
    [
      {
        tag: "ChoosePaymentAmounts",
        paymentAmountChoices: [
          { choiceId: "uuid", label: "Clues", minBound: 0, maxBound: 2 },
        ],
        paymentAmountTargetValue: { tag: "TotalAmountTarget", contents: 1 },
      },
      /type="number"/,
    ],
    [
      {
        tag: "ChooseExchangeAmounts",
        investigator1Id: "01001",
        investigator2Id: "01002",
        investigator1InitialAmount: 2,
        investigator2InitialAmount: 3,
        token: "Clue",
      },
      /Confirm exchange/,
    ],
    [{ tag: "ChooseDeck" }, /type="file"/],
    [{ tag: "ChooseJoinDeck" }, /Saved deck/],
    [{ tag: "ChooseUpgradeDeck" }, /Keep this investigator/],
    [{ tag: "PickScenarioSettings" }, /Begin with these settings/],
    [{ tag: "PickCampaignSettings" }, /Begin with these settings/],
    [
      {
        tag: "PickScenarioSpecific",
        contents: [
          "epicLabyrinth.note",
          { story: "70035", investigator: "01001" },
        ],
      },
      /<textarea/,
    ],
    [
      {
        tag: "PickScenarioSpecific",
        contents: [
          "laidToRest.buildSpiritDeck",
          { cardCodes: ["01001"], count: 1, fixed: [] },
        ],
      },
      /Build spirit deck/,
    ],
    [
      {
        tag: "PickCampaignSpecific",
        contents: [
          "embark",
          {
            current: "London",
            locations: [["Venice", { travel: 1 }]],
            available: ["Venice"],
            hasTicket: true,
          },
        ],
      },
      /Travel without stopping/,
    ],
    [
      {
        tag: "PickDestiny",
        drawings: [
          { scenario: "a", tarot: { arcana: "TheFool0", facing: "Upright" } },
        ],
      },
      /Confirm destiny/,
    ],
    [{ tag: "ContinueCampaign" }, /Continue/],
    [
      {
        tag: "PickSupplies",
        pointsRemaining: 3,
        chosenSupplies: ["Rope"],
        choices: labels,
      },
      /3 supply points remaining/,
    ],
    [
      {
        tag: "ChooseOneWizard",
        flavorText: { body: [] },
        wizardChoices: [{ label: "Path", flavorText: { body: [] } }],
        confirmLabel: "Confirm",
        backLabel: "Back",
      },
      /Path/,
    ],
    [{ tag: "DropDown", options: [["Entry", {}]] }, /Entry/],
  ];
  for (const [question, expected] of cases) {
    const q = decodeNativeQuestion(question, {
      ...ctx,
      game,
      playerId: "seat-a",
    });
    const output = renderToStaticMarkup(
      createElement(CompanionDecision, {
        game,
        model: q,
        context: ctx,
        cards: new Map(),
        busy: false,
        inspect: () => {},
        submit: async () => {
          submissions++;
        },
        upgrade: async () => {},
        session: { gameId: "g" },
        note: async () => {},
      }),
    );
    assert.match(output, expected, String((question as { tag: string }).tag));
    assert.doesNotMatch(output, /type="hidden"|Raw.*SendMessage/);
    assert.doesNotMatch(
      output,
      /resource_token|clue_token|doom_token|horror_token|damage_token/,
    );
    if (q.kind === "deck") assert.match(output, /aria-label="Saved deck"/);
    if (q.kind === "upgrade") assert.match(output, /aria-label="Investigator"/);
  }
  assert.equal(submissions, 0);
});

test("English locale plural/link/literal syntax renders printed words without executing markup", () => {
  const translate = companionTranslator({
    items: "no clues | one clue | {count} clues",
    pair: "one card | {n} cards",
    brace: "Add {'{'}curse{'}'}",
    a: "@:b",
    b: "@.upper:c",
    c: "Done",
    cycle1: "@:cycle2",
    cycle2: "@:cycle1",
    danger: "<script>alert(1)</script>",
  });
  assert.equal(translate("items", { count: 0 }), "no clues");
  assert.equal(translate("items", { count: 1 }), "one clue");
  assert.equal(translate("items", { count: 3 }), "3 clues");
  assert.equal(translate("pair", { n: 2 }), "2 cards");
  assert.equal(translate("brace", { curse: "not substituted" }), "Add {curse}");
  assert.equal(translate("a", {}), "DONE");
  assert.match(translate("cycle1", {})!, /^@:/);
  assert.equal(translate("danger", {}), "<script>alert(1)</script>");
});

test("native Single/And/Or actions and additional costs produce truthful ability labels", () => {
  const ability = {
    source: { tag: "AssetSource", contents: "asset" },
    type: {
      tag: "ReactionAbility",
      actions: {
        tag: "OrActions",
        contents: [
          { tag: "SingleAction", contents: "Fight" },
          {
            tag: "AndActions",
            contents: [
              { tag: "SingleAction", contents: "Investigate" },
              { tag: "SingleAction", contents: "Move" },
            ],
          },
        ],
      },
      cost: { tag: "Free" },
    },
    additionalCosts: [{ tag: "ResourceCost", contents: 2 }],
    index: 1,
  };
  const choice = describeCompanionChoice(
    { tag: "AbilityLabel", ability },
    { assets: { asset: { id: "asset", name: { title: "Tool" } } } },
  );
  assert.equal(choice.label, "Tool: Reaction · Fight or Investigate + Move");
  assert.equal(describeCompanionCost(choice.cost), "2 resources");
  const silent = describeCompanionChoice({
    tag: "AbilityLabel",
    ability: { ...ability, type: { tag: "SilentForcedAbility" } },
  });
  assert.match(silent.label, /Resolve effect/);
  assert.doesNotMatch(silent.label, /Forced/);
});
test("token group labels show resolved faces and the printed cancel/ignore/resolve instruction", () => {
  const choice = describeCompanionChoice({
    tag: "ChaosTokenGroupChoice",
    step: {
      tag: "Choose",
      amount: 1,
      tokenStrategy: "CancelChoice",
      steps: [
        { tag: "Resolved", tokens: [{ face: "Skull" }, { face: "MinusTwo" }] },
        { tag: "Undecided", step: { tag: "Draw" } },
      ],
    },
  });
  assert.match(
    choice.label,
    /Choose 1 group to cancel: Skull \+ −2 \/ Draw a token/,
  );
  assert.deepEqual(choice.tokens, ["Skull", "MinusTwo"]);
  assert.equal(choice.detail, undefined);
});
