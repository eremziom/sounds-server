import Hyperspeed from "../ui/hyperspeed";

export function AuthBackground() {
  return (
    <div aria-hidden="true" className="fixed inset-0 z-0">
      <Hyperspeed
        curve="racing"
        curvature={1}
        speed={1}
        boost={2.5}
        fov={53}
        boostFov={131}
        lanes={4}
        roadWidth={10}
        medianWidth={2}
        density={40}
        trailLength={1.3}
        lightSize={1}
        poles={6}
        dust={100}
        glow={0.45}
        reflections={0.5}
        roadOpacity={0.1}
        steer={0.25}
        tailColors={["#d856bf", "#6750a2", "#c247ac"]}
        headColors={["#03b3c3", "#0e5ea5", "#324555"]}
        poleColors={["#03b3c3"]}
        interactive
      />
    </div>
  );
}
