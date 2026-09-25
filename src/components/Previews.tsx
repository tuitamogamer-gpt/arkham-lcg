import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import scans from "../../public/data/art-manifest.json";
import { card, CARD_ART, LOCATION_ART, plain } from "../game/data";
import { canInspectCard, canReadReverse } from "../game/knowledge";
import type { Action, GameState } from "../game/types";
import { RulesText } from "./Common";
import {
  InvestigationAbility,
  INVESTIGATION_ABILITIES,
} from "./InvestigationAbility";

const selector =
  "[data-preview-code], [data-preview-back], [data-preview-title]";
type Preview = {
  title: string;
  text: string;
  label: string;
  art?: string;
  landscape?: boolean;
  assetId?: string;
};
function previewFor(el: HTMLElement, game: GameState | null): Preview | null {
  const {
    previewCode: code,
    previewFace: face,
    previewBack: back,
    previewTitle: title,
    previewText: text,
  } = el.dataset;
  if (back)
    return {
      title: back === "encounter" ? "Encounter deck" : "Investigator deck",
      label: "Card back",
      text: "Cards remain facedown. The next card is revealed only when it is drawn.",
      art: `/art/backs/${back}.png`,
    };
  if (!code)
    return title ? { title, text: text || "", label: "Campaign log" } : null;
  const c = card(code);
  if (!c) return null;
  const reverse = face === "back";
  const unexplored = reverse && c.type_code === "location";
  if (unexplored) {
    if (!game?.locations.some((l) => l.code === code && l.active)) return null;
  } else if (
    !canInspectCard(game, code) ||
    (reverse && !canReadReverse(game, code))
  )
    return null;
  const native = scans as Record<string, string>;
  const art = unexplored
    ? native[LOCATION_ART[code]?.unrevealed]
    : reverse
      ? native[`${code}b`]
      : CARD_ART[code];
  return {
    title: title || (reverse && !unexplored ? c.back_name || c.name : c.name),
    label: unexplored
      ? "Unexplored location"
      : `${c.type_code} · ${reverse ? "reverse side" : c.faction_code}`,
    text: unexplored
      ? "Enter this location to reveal its other side. Its clues, shroud and rules remain unknown."
      : text || plain(reverse ? c.back_text : c.text),
    art,
    landscape: ["act", "agenda", "investigator"].includes(c.type_code),
  };
}

/** Public card magnification, with explicit choices for in-play investigation tools. */
export function CardPreviewLayer({
  game,
  page,
  dispatch,
}: {
  game: GameState | null;
  page: string;
  dispatch: (action: Action) => void;
}) {
  const id = useId();
  const [preview, setPreview] = useState<
    (Preview & { left: number; top: number }) | null
  >(null);
  const tooltip = useRef<HTMLElement>(null);
  const dismiss = useRef<() => void>(() => {});
  const closePreview = useRef<() => void>(() => {});
  useEffect(() => {
    let anchor: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;
    let open = false;
    function close() {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      anchor?.removeAttribute("aria-describedby");
      anchor = null;
      open = false;
      setPreview(null);
    }
    closePreview.current = close;
    function behindDialog(target: HTMLElement) {
      const modal = document.querySelector(
        '.modal[aria-modal="true"]:not([inert])',
      );
      return !!modal && !modal.contains(target);
    }
    function dismissToCard() {
      const trigger =
        anchor?.closest<HTMLElement>("button") ||
        anchor?.querySelector<HTMLElement>("button");
      close();
      trigger?.focus({ preventScroll: true });
      // Restoring focus should not immediately reopen the choice.
      close();
    }
    dismiss.current = dismissToCard;
    close();
    function find(target: EventTarget | null) {
      if (!(target instanceof Element) || target.closest(".card-hover"))
        return null;
      // Focusing the card's enclosing button must work just like hovering its image.
      return (target.closest(selector) ||
        target.closest("button")?.querySelector(selector) ||
        target.closest("button")?.closest(selector)) as HTMLElement | null;
    }
    function show(target: HTMLElement, delay: number) {
      clearTimeout(hideTimer);
      if (anchor === target) return;
      close();
      anchor = target;
      timer = setTimeout(() => {
        if (
          !target.isConnected ||
          target.closest("[inert]") ||
          behindDialog(target)
        )
          return close();
        const content = previewFor(target, game);
        if (!content) return close();
        const assetId = target.closest<HTMLElement>("[data-preview-asset-id]")
          ?.dataset.previewAssetId;
        const asset =
          page === "game" && !target.closest('[role="dialog"]')
            ? game?.player.assets.find(
                (a) => a.id === assetId && INVESTIGATION_ABILITIES[a.code],
              )
            : undefined;
        const element =
          getComputedStyle(target).display === "contents"
            ? target.firstElementChild || target
            : target;
        const box = element.getBoundingClientRect();
        const width = Math.min(
          asset ? 760 : content.art ? 620 : 440,
          window.innerWidth - 24,
        );
        const height = Math.min(570, window.innerHeight - 24);
        let left = box.right + 14;
        if (left + width > window.innerWidth - 12) left = box.left - width - 14;
        setPreview({
          ...content,
          assetId: asset?.id,
          left: Math.max(12, Math.min(left, window.innerWidth - width - 12)),
          top: Math.max(
            12,
            Math.min(box.top, window.innerHeight - height - 12),
          ),
        });
        target.setAttribute("aria-describedby", id);
        open = true;
      }, delay);
    }
    function enter(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      if (tooltip.current?.contains(e.target as Node)) {
        clearTimeout(hideTimer);
        return;
      }
      const target = find(e.target);
      if (target) show(target, 240);
    }
    function leave(e: PointerEvent) {
      const next = e.relatedTarget as Node | null;
      if (anchor?.contains(next) || tooltip.current?.contains(next)) return;
      if (tooltip.current?.contains(document.activeElement)) return;
      clearTimeout(timer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(close, 160);
    }
    function focus(e: FocusEvent) {
      if (tooltip.current?.contains(e.target as Node)) {
        clearTimeout(hideTimer);
        return;
      }
      const target = find(e.target);
      if (target) show(target, 0);
    }
    function blur(e: FocusEvent) {
      if (
        tooltip.current?.contains(e.relatedTarget as Node) ||
        anchor?.contains(e.relatedTarget as Node)
      )
        return;
      close();
    }
    function scroll(e: Event) {
      if (open && !tooltip.current?.contains(e.target as Node)) close();
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Tab" && tooltip.current?.contains(e.target as Node)) {
        const controls = [
          ...tooltip.current.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select",
          ),
        ];
        const current = controls.indexOf(e.target as HTMLElement);
        if (current >= 0) {
          e.preventDefault();
          const next = controls[current + (e.shiftKey ? -1 : 1)];
          if (next) next.focus();
          else dismissToCard();
          return;
        }
      }
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        open &&
        anchor?.contains(e.target as Node)
      ) {
        const control = tooltip.current?.querySelector<HTMLElement>(
          "button:not(:disabled), select",
        );
        if (control) {
          e.preventDefault();
          control.focus();
        }
      }
      if (e.key === "Escape" && open) {
        if (tooltip.current?.contains(document.activeElement)) dismissToCard();
        else close();
        e.stopPropagation();
        e.preventDefault();
      }
    }
    function click(e: Event) {
      if (!tooltip.current?.contains(e.target as Node)) close();
    }
    const observer = new MutationObserver(() => {
      if (
        anchor &&
        (!anchor.isConnected ||
          anchor.closest("[inert]") ||
          behindDialog(anchor))
      )
        close();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["inert"],
    });
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      close();
      observer.disconnect();
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
    };
  }, [game, page, id]);
  return (
    preview &&
    createPortal(
      <aside
        ref={tooltip}
        id={id}
        role={preview.assetId ? "dialog" : "tooltip"}
        aria-label={preview.assetId ? `${preview.title} ability` : undefined}
        className={`card-hover magnifier ${preview.assetId ? "ability-preview" : ""} ${preview.art ? "with-card" : ""} ${preview.landscape ? "landscape-preview" : ""}`}
        style={{ left: preview.left, top: preview.top }}
      >
        {preview.art && (
          <img
            className="magnifier-image"
            src={preview.art}
            alt={preview.title}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        <div className="hover-copy">
          <span className="eyebrow">{preview.label}</span>
          <h3>{preview.title}</h3>
          <div className="rules-text">
            <RulesText text={preview.text} />
          </div>
          {preview.assetId && game && (
            <InvestigationAbility
              key={preview.assetId}
              game={game}
              assetId={preview.assetId}
              onDismiss={() => dismiss.current()}
              onActivate={(action) => {
                closePreview.current();
                dispatch(action);
              }}
            />
          )}
        </div>
      </aside>,
      document.body,
    )
  );
}
