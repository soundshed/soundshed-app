// @vitest-environment jsdom
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../testing/componentTestSetup";
import { DeviceStateStore } from "../../stores/devicestate";
import { FxCatalogProvider } from "../../spork/src/devices/spark/sparkFxCatalog";

// fx-control.tsx pulls deviceViewModel from components/app, which would drag in the
// whole application on import.
vi.mock("../app", () => ({
  deviceViewModel: { requestFxChange: vi.fn().mockResolvedValue(true) },
}));

import FxControl from "../device/fx-control";

const AMP_SLOT = 3;

const renderFx = (type: string, slotIndex?: number) =>
  render(
    <FxControl
      fx={{ type, name: "", enabled: true, params: [] }}
      onFxParamChange={() => {}}
      onFxToggle={() => {}}
      slotIndex={slotIndex}
    />
  );

const modelSelect = () => screen.getByRole("combobox") as HTMLSelectElement;
const optionValues = () => Array.from(modelSelect().options).map((o) => o.value);

describe("fx model selection", () => {
  beforeEach(() => {
    act(() =>
      DeviceStateStore.update((s) => {
        s.fxCatalog = FxCatalogProvider.getFxCatalog();
      })
    );
  });

  // Reported from real use: with a Jimi Hendrix expansion amp on the amp, the amp
  // block's model list was empty, so no other amp could be chosen.
  it.each(["JH.DualShowman", "JH.Sunn100", "JH.Bassman50Silver", "JH.SoundCity100"])(
    "lists the amps when the current amp is %s",
    (dspId) => {
      renderFx("pg.spark40." + dspId, AMP_SLOT);

      expect(modelSelect().value).toBe("pg.spark40." + dspId);
      expect(optionValues()).toEqual(
        expect.arrayContaining([
          "pg.spark40.Twin",
          "pg.spark40.JH.JTM45",
          "pg.spark40.JH.SuperLead100",
          "pg.spark40.JH.DualShowman",
          "pg.spark40.JH.Sunn100",
          "pg.spark40.JH.Bassman50Silver",
          "pg.spark40.JH.SoundCity100",
        ])
      );
    }
  );

  it("still lists the amps for a model the catalog does not know yet, using the slot", () => {
    renderFx("pg.spark40.JH.SomeFutureAmp", AMP_SLOT);

    expect(modelSelect().value).toBe("pg.spark40.JH.SomeFutureAmp");
    expect(optionValues()).toContain("pg.spark40.Twin");
    expect(screen.getByText("Amp", { selector: "label" })).toBeInTheDocument();
  });

  it("never renders an empty model list, even without a known slot", () => {
    renderFx("pg.spark40.SomethingUnknown");

    expect(optionValues()).toEqual(["pg.spark40.SomethingUnknown"]);
    expect(modelSelect().value).toBe("pg.spark40.SomethingUnknown");
  });

  it("keeps showing a removed model that is still on the amp", () => {
    renderFx("pg.spark40.JCM800", AMP_SLOT);

    expect(modelSelect().value).toBe("pg.spark40.JCM800");
    expect(optionValues().filter((v) => v == "pg.spark40.JCM800")).toHaveLength(1);
  });
});
