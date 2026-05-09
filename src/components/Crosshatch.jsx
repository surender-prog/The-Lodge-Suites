import React from "react";
import { C } from "../data/tokens.js";

let _hatchSeq = 0;

export const Crosshatch = ({ opacity = 0.1, color = C.gold }) => {
  // Unique id per instance prevents pattern bleed across multiple Crosshatch nodes on a page.
  const id = React.useMemo(() => `hatchBig-${++_hatchSeq}`, []);
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
      <defs>
        <pattern id={id} width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 0 80 L 80 0 M -10 10 L 10 -10 M 70 90 L 90 70" stroke={color} strokeWidth="0.5" fill="none" />
          <path d="M 0 0 L 80 80 M -10 70 L 10 90 M 70 -10 L 90 10" stroke={color} strokeWidth="0.5" fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};
