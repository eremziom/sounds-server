import { getTranslations } from "next-intl/server";
import type { ComponentProps } from "react";
import FuzzyText from "@/components/react-bits/FuzzyText";

// Settings for the animated 404. Values match the component defaults except fontSize.
const fuzzyTextConfig = {
  fontSize: "clamp(3rem, 18vw, 10rem)",
  fontWeight: 900,
  fontFamily: "inherit",
  color: "currentColor",
  enableHover: true,
  baseIntensity: 0.18,
  hoverIntensity: 0.5,
  fuzzRange: 30,
  fps: 60,
  direction: "horizontal",
  transitionDuration: 0,
  clickEffect: false,
  glitchMode: false,
  glitchInterval: 2000,
  glitchDuration: 200,
  gradient: null,
  letterSpacing: 0,
  sliceSize: 12,
  trigger: "hover",
  intro: false,
  introDuration: 1400,
  colorSplit: 0.85,
} satisfies Omit<ComponentProps<typeof FuzzyText>, "children" | "className">;

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");
  return (
    <main className="flex flex-1 items-center justify-center p-6" data-page-not-found>
      <section className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <FuzzyText {...fuzzyTextConfig} className="max-w-full">
          404
        </FuzzyText>
        <div className="space-y-2 break-words">
          <h1 className="text-base font-medium">{t("title")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
        </div>
      </section>
    </main>
  );
}
