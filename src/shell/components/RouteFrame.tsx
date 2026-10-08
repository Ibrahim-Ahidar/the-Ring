import { getTranslations } from "next-intl/server";

type RouteFrameProps = {
  titleKey: string;
  meta?: string;
};

export async function RouteFrame({ titleKey, meta }: RouteFrameProps) {
  const t = await getTranslations("shell.routes");

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t(titleKey)}</h1>
      {meta ? <p className="route-frame-meta">{meta}</p> : null}
    </div>
  );
}
