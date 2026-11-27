import React from "react";
import { fallbackImageUrlFor, imageUrlFor } from "../../../core/fxModelInfo";

// Model image with a two-step fallback: the model's own image, then the generic
// amp/pedal image, then a plain CSS placeholder. Images are relative to the page
// (webpack copies ./images next to the bundle); some may not exist yet.

interface FxImageProps {
  dspId: string | null | undefined;
  slotType: string | null | undefined;
  /** Accessible name; pass "" for a decorative image next to visible text. */
  alt: string;
  className?: string;
  /** Text shown in the CSS placeholder, e.g. the slot label */
  placeholder?: string;
}

const FxImage = ({ dspId, slotType, alt, className, placeholder }: FxImageProps) => {
  // 0 = model image, 1 = generic image, 2 = CSS placeholder
  const [stage, setStage] = React.useState(0);

  React.useEffect(() => {
    setStage(0);
  }, [dspId, slotType]);

  const classes = ["amp-desk-img", slotType == "amp" ? "amp-desk-img--amp" : "amp-desk-img--pedal"];
  if (className) classes.push(className);

  if (stage >= 2) {
    return (
      <span
        className={[...classes, "amp-desk-img--placeholder"].join(" ")}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        data-testid="fx-image-placeholder"
      >
        <span aria-hidden="true">{placeholder ?? ""}</span>
      </span>
    );
  }

  const modelSrc = "./" + imageUrlFor(dspId, slotType);
  const fallbackSrc = "./" + fallbackImageUrlFor(slotType);
  const src = stage == 0 ? modelSrc : fallbackSrc;

  // An unknown model already uses the generic image, so a failure there goes straight
  // to the placeholder rather than retrying the same file.
  const onError = () => setStage((s) => (s == 0 && modelSrc != fallbackSrc ? 1 : 2));

  return (
    <img
      className={classes.join(" ")}
      src={src}
      alt={alt}
      draggable={false}
      loading="lazy"
      onError={onError}
    />
  );
};

export default FxImage;
