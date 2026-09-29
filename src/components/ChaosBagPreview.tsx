import { BAGS, card, plain } from "../game/data";
import type { Difficulty } from "../game/types";
import { Token } from "./Common";

const SYMBOLS = [
  { token: "skull", name: "Skull" },
  { token: "tablet", name: "Tablet" },
  { token: "elder_thing", name: "Elder Thing" },
  { token: "auto_fail", name: "Auto-fail" },
] as const;

export function ChaosBagPreview({
  difficulty,
  investigators,
}: {
  difficulty: Difficulty;
  investigators: string[];
}) {
  const bag = BAGS[difficulty];
  const hard = difficulty === "hard" || difficulty === "expert";
  const reference = card("12105");
  const rules = (hard ? reference.back_text : reference.text) || "";
  const numbers = bag.filter((token) => /^[+-]?\d+$/.test(token));
  const count = (token: string) =>
    bag.filter((value) => value === token).length;
  const symbolRule = (token: string) =>
    plain(
      rules
        .split("\n")
        .find((line) => line.startsWith(`[${token}]`))
        ?.replace(`[${token}] `, ""),
    );

  return (
    <section className="chaos-bag-preview" aria-labelledby="chaos-bag-title">
      <div className="chaos-bag-overview">
        <figure className="chaos-bag-art">
          <img
            src="/art/chaos-bag.webp"
            alt="An open green velvet chaos bag with brass drawstrings and scattered tokens"
            width="1254"
            height="1254"
          />
          <figcaption>One draw. An uncertain fate.</figcaption>
        </figure>
        <div className="chaos-bag-contents">
          <div className="chaos-bag-heading">
            <div>
              <span className="chaos-bag-kicker">Know what you’re drawing</span>
              <h3 id="chaos-bag-title">The chaos bag</h3>
            </div>
            <span
              className="chaos-bag-count"
              aria-live="polite"
              aria-atomic="true"
            >
              <strong>{bag.length} tokens</strong>
              <span>{difficulty}</span>
            </span>
          </div>
          <p className="chaos-bag-intro">
            During a skill test, draw a token and apply its modifier and effect.
            Match or beat the test’s difficulty to succeed.
          </p>
          <div className="chaos-bag-section-heading">
            <h4>Number tokens</h4>
            <span>{numbers.length} in the bag</span>
          </div>
          <ul
            className="chaos-number-tokens"
            aria-label="Number tokens in the bag"
          >
            {[...new Set(numbers)].map((token) => (
              <li key={token} aria-label={`${token}: ${count(token)} tokens`}>
                <span aria-hidden="true">
                  <Token token={token} size={42} />
                </span>
                <span className="chaos-token-quantity" aria-hidden="true">
                  ×{count(token)}
                </span>
              </li>
            ))}
          </ul>
          <p className="chaos-number-help">
            Add this number to your skill. × shows how many copies are in the
            bag.
          </p>
        </div>
      </div>
      <div className="chaos-symbol-guide">
        <div className="chaos-bag-section-heading">
          <h4>What the symbols mean</h4>
          <span>
            Spreading Flames · {hard ? "Hard / Expert" : "Easy / Standard"}
          </span>
        </div>
        <ul className="chaos-symbol-list">
          {SYMBOLS.map(({ token, name }) => (
            <li
              key={token}
              className={`chaos-symbol-entry chaos-symbol-${token}`}
            >
              <div
                className="chaos-symbol-face"
                role="img"
                aria-label={`${name}: ${count(token)} tokens`}
              >
                <Token token={token} size={48} />
                <span>×{count(token)}</span>
              </div>
              <div className="chaos-symbol-copy">
                <h5>{name}</h5>
                <p>
                  {token === "auto_fail"
                    ? "Automatically fail this skill test, regardless of your skill value."
                    : symbolRule(token)}
                </p>
                {token === "skull" && (
                  <span className="chaos-symbol-hint">
                    At the start of this scenario: {hard ? "−2" : "−1"}.
                  </span>
                )}
              </div>
            </li>
          ))}
          <li className="chaos-symbol-entry chaos-symbol-elder_sign">
            <div
              className="chaos-symbol-face"
              role="img"
              aria-label={`Elder Sign: ${count("elder_sign")} token`}
            >
              <Token token="elder_sign" size={48} />
              <span>×{count("elder_sign")}</span>
            </div>
            <div className="chaos-symbol-copy">
              <h5>
                Elder Sign <span>Your investigator’s ability</span>
              </h5>
              <p>Use the effect of the investigator taking the test.</p>
              <ul className="chaos-investigator-effects">
                {investigators.map((code) => {
                  const investigator = card(code);
                  const effect = plain(
                    investigator.text?.split("[elder_sign] effect: ")[1],
                  );
                  return (
                    <li key={code}>
                      <strong>{investigator.name}</strong>
                      <p>{effect}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        </ul>
      </div>
      <p className="chaos-bag-footer">
        After the test, the revealed tokens return to the bag.
      </p>
    </section>
  );
}
