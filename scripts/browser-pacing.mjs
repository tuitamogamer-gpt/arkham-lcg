// Broad smoke tests explicitly pass Fast opportunities. The dedicated timing
// browser check controls those windows itself. Other choices remain explicit.
export async function acknowledgeEvents(page) {
  for (let n = 0; n < 150; n++) {
    const s = JSON.parse(
      await page.evaluate(() => window.render_game_to_text()),
    );
    if (!s.event) {
      if (s.window) {
        await page
          .getByRole("button", { name: "Pass Fast window", exact: true })
          .click();
        continue;
      }
      return;
    }
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
