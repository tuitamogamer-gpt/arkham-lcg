// Explicit confirmations for broad gameplay smoke tests. This never chooses a
// game decision or resolves a skill test; those remain individual test actions.
export async function acknowledgeEvents(page) {
  for (let n = 0; n < 150; n++) {
    const s = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    if (!s.event) return;
    await page
      .getByRole("button", { name: "Continue game", exact: true })
      .click();
  }
  throw Error("Presentation checkpoints failed to terminate");
}

export async function clickAndAcknowledge(locator, page) {
  await locator.click();
  await acknowledgeEvents(page);
}
