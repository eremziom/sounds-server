import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";
import { getTranslations } from "next-intl/server";
import { BackgroundControls } from "@/components/application/background-controls";
import { AudioAnimationControls } from "@/components/application/audio-animation-controls";
import { ClientMessages } from "@/i18n/client-messages";

export default async function AnimationsPage() {
  await requireRoles(APP_ROLES);
  const controls = await getTranslations("app.animations");

  return (
    <main className="py-6">
      <ClientMessages namespaces={["app"]}>
        <AudioAnimationControls />
      </ClientMessages>
      <BackgroundControls labels={{
        configuration: controls("configuration"),
        description: controls("description"),
        colors: controls("colors"),
        color: controls("color"),
        coreColor: controls("coreColor"),
        addColor: controls("addColor"),
        removeColor: controls("removeColor"),
        reset: controls("reset"),
        parameters: {
          threadCount: controls("parameters.threadCount"),
          spread: controls("parameters.spread"),
          speed: controls("parameters.speed"),
          frequency: controls("parameters.frequency"),
          taper: controls("parameters.taper"),
          position: controls("parameters.position"),
          pinch: controls("parameters.pinch"),
          nodes: controls("parameters.nodes"),
          angle: controls("parameters.angle"),
          glow: controls("parameters.glow"),
          falloff: controls("parameters.falloff"),
          brightness: controls("parameters.brightness"),
          depth: controls("parameters.depth"),
          pulses: controls("parameters.pulses"),
          fade: controls("parameters.fade"),
          grain: controls("parameters.grain"),
          mouseStrength: controls("parameters.mouseStrength"),
        },
      }} />
    </main>
  );
}
