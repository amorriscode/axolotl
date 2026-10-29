import { useReducedMotion } from "framer-motion";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AxolotlPoster } from "./poster";
import type { AxolotlScene } from "./scene";

export interface HeroHandle {
  setOffscreen: (off: boolean) => void;
}

export const HeroCanvas = forwardRef<HeroHandle>(function HeroCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AxolotlScene | null>(null);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();

  useImperativeHandle(ref, () => ({
    setOffscreen(off: boolean) {
      sceneRef.current?.setOffscreen(off);
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: AxolotlScene | null = null;
    let cancelled = false;
    import("./scene")
      .then(({ AxolotlScene: Scene }) => {
        if (cancelled || !canvasRef.current) return;
        scene = new Scene(canvasRef.current, {
          reduced: reduce === true,
          onReady: () => {
            const stage = canvasRef.current?.parentElement;
            stage?.classList.add("is-ready");
            stage?.querySelector(".poster")?.setAttribute("hidden", "");
            setReady(true);
          },
        });
        sceneRef.current = scene;
      })
      .catch((error: unknown) => {
        console.error(error);
        if (canvasRef.current) canvasRef.current.dataset.error = error instanceof Error ? error.message : String(error);
      });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [reduce]);

  return (
    <div className={ready ? "stage-fill is-ready" : "stage-fill"}>
      <AxolotlPoster />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
});
