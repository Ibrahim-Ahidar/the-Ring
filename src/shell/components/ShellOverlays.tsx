"use client";

import { memo, useMemo } from "react";

import { getContributions } from "@/shell/slots";

function ShellOverlaysInner() {
  const overlays = useMemo(() => getContributions("overlay"), []);

  return (
    <>
      {overlays.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </>
  );
}

export const ShellOverlays = memo(ShellOverlaysInner);
