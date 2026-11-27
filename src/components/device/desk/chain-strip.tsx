import React from "react";
import { DeskBlock } from "./desk-model";
import FxImage from "./fx-image";

// The seven-block signal chain, left to right like the amp. Each tile is a tab
// (the inspector below is its panel). A tablist may only own tabs, so the on/off
// LEDs live in a separate overlay after it that repeats the tile grid; CSS puts
// each LED on its tile's corner. Left/Right navigation is handled by the screen,
// Home/End here.

export const INSPECTOR_PANEL_ID = "amp-desk-inspector";
export const tabIdFor = (slotIndex: number) => `amp-desk-tab-${slotIndex}`;

interface ChainStripProps {
  blocks: DeskBlock[];
  selectedIndex: number;
  onSelect: (slotIndex: number) => void;
  onToggle: (block: DeskBlock) => void;
  onOpenBrowser: (slotIndex: number) => void;
}

const ChainStrip = ({ blocks, selectedIndex, onSelect, onToggle, onOpenBrowser }: ChainStripProps) => {
  const stripRef = React.useRef<HTMLDivElement>(null);

  // Keyboard selection changes keep focus on the selected tab, as in any tab list.
  React.useEffect(() => {
    const strip = stripRef.current;
    const active = document.activeElement as HTMLElement | null;
    if (!strip || !active || !strip.contains(active) || active.getAttribute("role") != "tab") return;
    const tab = document.getElementById(tabIdFor(selectedIndex));
    if (tab && tab != active) tab.focus();
  }, [selectedIndex]);

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, block: DeskBlock) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key == "Enter" && block.fx != null) {
      e.preventDefault();
      e.stopPropagation();
      onOpenBrowser(block.slotIndex);
    } else if ((e.key == "Home" || e.key == "End") && blocks.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      onSelect(blocks[e.key == "Home" ? 0 : blocks.length - 1].slotIndex);
    }
  };

  return (
    <div className="amp-desk-chain" data-desk-region="chain" ref={stripRef}>
      <div className="amp-desk-chain__cable" aria-hidden="true" />
      <div className="amp-desk-chain__tiles" role="tablist" aria-label="Signal chain" aria-orientation="horizontal">
        {blocks.map((block) => {
          const selected = block.slotIndex == selectedIndex;
          const empty = block.fx == null;
          const enabled = block.fx?.enabled == true;

          const classes = ["amp-desk-tile"];
          if (block.slot.type == "amp") classes.push("amp-desk-tile--amp");
          if (selected) classes.push("amp-desk-tile--selected");
          if (empty) classes.push("amp-desk-tile--empty");
          else if (!enabled) classes.push("amp-desk-tile--off");

          return (
            <div
              key={block.slotIndex}
              role="presentation"
              className={classes.join(" ")}
              data-testid={`chain-tile-${block.slot.type}`}
            >
              <div
                role="tab"
                id={tabIdFor(block.slotIndex)}
                className="amp-desk-tile__select"
                aria-selected={selected}
                aria-controls={INSPECTOR_PANEL_ID}
                aria-label={`${block.slot.label}: ${block.name}${empty ? "" : enabled ? "" : " (off)"}`}
                tabIndex={selected ? 0 : -1}
                title={empty ? block.slot.label : `${block.name} – double-click or press M to change the model`}
                onClick={() => onSelect(block.slotIndex)}
                onDoubleClick={() => {
                  if (empty) return;
                  onSelect(block.slotIndex);
                  onOpenBrowser(block.slotIndex);
                }}
                onKeyDown={(e) => onTabKeyDown(e, block)}
              >
                <span className="amp-desk-tile__image">
                  <FxImage
                    dspId={block.fx?.type}
                    slotType={block.slot.type}
                    alt=""
                    placeholder={block.slot.label.charAt(0)}
                  />
                </span>
                <span className="amp-desk-tile__slot">{block.slot.label}</span>
                <span className="amp-desk-tile__name">{block.name}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="amp-desk-chain__leds">
        {blocks.map((block) => {
          const enabled = block.fx?.enabled == true;
          return (
            <div key={block.slotIndex} className="amp-desk-chain__led-cell">
              {block.fx != null && (
                <button
                  type="button"
                  className={`amp-desk-tile__led ${enabled ? "is-on" : "is-off"}`}
                  aria-pressed={enabled}
                  aria-label={`${block.slot.label} ${enabled ? "enabled" : "disabled"}`}
                  title={`${enabled ? "Switch off" : "Switch on"} (Space)`}
                  onClick={() => onToggle(block)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChainStrip;
