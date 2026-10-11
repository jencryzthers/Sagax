// Crab, the pixel-rect mascot (crab-art.ts): one coral fill, 2x2 eyes with a
// shine, pincer claws and four legs with feet. Small avatars draw a still
// frame (the bust under 48 px). Larger ones bob, look, pinch and blink in
// CSS (crab-mascot.css). A move or a held activity runs the rig of
// crab-moves.ts instead.
import "./crab-mascot.css";
import { memo, useEffect, useMemo, useRef, useState, type Ref, type RefObject } from "react";
import { MAUS_COLORS } from "@/lib/mascot";
import { cn } from "@/lib/cn";
import { CRAB_SKIN_TIER, type CrabSkin } from "../../shared/mascot-look";
import { CRAB_CORAL, CRAB_PARTS, CRAB_PIVOTS, CRAB_SPARK, crabEyeDraw, crabViewBox, type CrabRect } from "./crab-art";
import { CrabRig, crabMoveFor, crabReducedFace, crabRestPose, crabTransforms, type CrabGroup, type CrabMove, type CrabPose } from "./crab-moves";
import { crabSkinId, crabSkinPaint } from "./skin-fx/crab-skins";
import { fxDetail, useReducedMotion, useReplayMove, type FxDetail, type FxMoveRequest } from "./skin-fx/skin-fx";

export type CrabMood = "idle" | "thinking" | "working" | "happy" | "sleeping" | "listening" | "speaking";

export function crabExpressionForMood(mood: CrabMood): string {
  switch (mood) {
    case "thinking":
      return "curious";
    case "working":
      return "attentive";
    case "happy":
      return "happy";
    case "sleeping":
      return "sleepy";
    case "listening":
      return "attentive";
    case "speaking":
      return "excited";
    default:
      return "neutral";
  }
}

export interface CrabMascotProps {
  skin?: CrabSkin | string;
  color: string;
  size?: number;
  mood?: CrabMood;
  expression?: string;
  animated?: boolean;
  detail?: FxDetail;
  move?: FxMoveRequest | null;
  moveBody?: boolean;
  activity?: CrabMove | null;
  rig?: boolean;
  label?: string | null;
  className?: string;
}

export const crabHexOf = (color: string) => (MAUS_COLORS as Record<string, string>)[color] ?? (/^#[0-9a-fA-F]{6}$/.test(color) ? color : CRAB_CORAL);

function Pixel({ r, fill }: { r: CrabRect; fill: string }) {
  return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} />;
}

export type CrabGroups = Partial<Record<CrabGroup, SVGGElement | null>>;

export interface CrabDrawingProps {
  fill: string;
  eyes: string;
  shine: string;
  size: number;
  face?: string | null;
  groups?: RefObject<CrabGroups>;
  pose?: CrabPose | null;
  svgRef?: Ref<SVGSVGElement>;
  svgClass?: string;
}

const Drawing = memo(function CrabDrawing({ fill, eyes, shine, size, face, groups, pose, svgRef, svgClass }: CrabDrawingProps) {
  const own = (key: CrabGroup) => (node: SVGGElement | null) => {
    if (groups) groups.current[key] = node;
  };
  const t = pose ? crabTransforms(pose) : null;
  const drawn = crabEyeDraw(face ?? pose?.expression);
  const spark = pose?.spark ?? 0;
  return (
    <svg ref={svgRef} viewBox={crabViewBox(size)} width={size} height={size} shapeRendering="crispEdges" className={svgClass} aria-hidden>
      <g className="crab-whole" ref={own("whole")} transform={t?.whole} style={{ transformOrigin: `${CRAB_PIVOTS.ground[0]}px ${CRAB_PIVOTS.ground[1]}px` }}>
        <Pixel r={CRAB_PARTS.body} fill={fill} />
        <g className="crab-arm crab-arm-l" ref={own("armL")} transform={t?.armL} style={{ transformOrigin: `${CRAB_PIVOTS.armL[0]}px ${CRAB_PIVOTS.armL[1]}px` }}>
          <Pixel r={CRAB_PARTS.armL} fill={fill} />
          <g className="crab-pincer crab-pincer-l" ref={own("pincerL")} transform={t?.pincerL}>
            <Pixel r={CRAB_PARTS.pincerL} fill={fill} />
          </g>
        </g>
        <g className="crab-arm crab-arm-r" ref={own("armR")} transform={t?.armR} style={{ transformOrigin: `${CRAB_PIVOTS.armR[0]}px ${CRAB_PIVOTS.armR[1]}px` }}>
          <Pixel r={CRAB_PARTS.armR} fill={fill} />
          <g className="crab-pincer crab-pincer-r" ref={own("pincerR")} transform={t?.pincerR}>
            <Pixel r={CRAB_PARTS.pincerR} fill={fill} />
          </g>
        </g>
        {CRAB_PARTS.legs.map((leg, i) => {
          const key = `leg${i}` as "leg0" | "leg1" | "leg2" | "leg3";
          return (
            <g key={key} className={`crab-leg crab-leg-${i}`} ref={own(key)} transform={t?.[key]} style={{ transformOrigin: `${CRAB_PIVOTS.legs[i]![0]}px ${CRAB_PIVOTS.legs[i]![1]}px` }}>
              <Pixel r={leg} fill={fill} />
              <Pixel r={CRAB_PARTS.feet[i]!} fill={fill} />
            </g>
          );
        })}
        <g className="crab-eyes" ref={own("eyes")} transform={t?.eyes}>
          <g className="crab-eye crab-eye-l" ref={own("eyeL")} transform={t?.eyeL} style={{ transformOrigin: `${CRAB_PIVOTS.eyeL[0]}px ${CRAB_PIVOTS.eyeL[1]}px` }}>
            <Pixel r={drawn.pupils[0]} fill={eyes} />
            {drawn.shines ? <Pixel r={drawn.shines[0]} fill={shine} /> : null}
          </g>
          <g className="crab-eye crab-eye-r" ref={own("eyeR")} transform={t?.eyeR} style={{ transformOrigin: `${CRAB_PIVOTS.eyeR[0]}px ${CRAB_PIVOTS.eyeR[1]}px` }}>
            <Pixel r={drawn.pupils[1]} fill={eyes} />
            {drawn.shines ? <Pixel r={drawn.shines[1]} fill={shine} /> : null}
          </g>
        </g>
        <g className="crab-sparkles" ref={own("sparkles")} transform={t?.sparkles} opacity={spark} style={{ opacity: spark }}>
          {CRAB_PARTS.sparkles.map((dot, i) => (
            <Pixel key={i} r={dot} fill={CRAB_SPARK} />
          ))}
        </g>
      </g>
    </svg>
  );
});

const seconds = () => (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;

export function CrabMascot({
  skin = "plain",
  color,
  size = 44,
  mood = "idle",
  expression,
  animated = true,
  detail,
  move,
  moveBody = false,
  activity = null,
  rig: alwaysRig = false,
  label = null,
  className,
}: CrabMascotProps) {
  const known = crabSkinId(skin);
  const hex = crabHexOf(color);
  const reduced = useReducedMotion();
  const full = fxDetail(size, animated, detail) === "full";
  const live = full && !reduced;
  const paint = useMemo(() => crabSkinPaint(known, hex), [known, hex]);
  const root = useRef<HTMLSpanElement>(null);
  const body = useRef<SVGSVGElement>(null);
  const crabMove = crabMoveFor(move?.clip);
  useReplayMove(body, moveBody && !crabMove ? (move?.key ?? null) : null);
  const groups = useRef<CrabGroups>({});
  const engine = useRef<CrabRig | null>(null);
  const [discrete, setDiscrete] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const keepRunning = useRef(alwaysRig || activity !== null);
  keepRunning.current = alwaysRig || activity !== null;
  const moveKey = move?.key ?? 0;

  useEffect(() => {
    if (!live) {
      engine.current = null;
      return;
    }
    engine.current = new CrabRig(seconds());
    if (keepRunning.current) setRunning(true);
    return () => {
      engine.current = null;
    };
  }, [live]);

  useEffect(() => {
    if (!live) return;
    engine.current?.hold(activity, seconds());
    if (activity || alwaysRig) setRunning(true);
  }, [activity, alwaysRig, live]);

  const lastMove = useRef(0);
  useEffect(() => {
    if (!live || !crabMove || !moveKey || moveKey === lastMove.current) return;
    lastMove.current = moveKey;
    engine.current?.play(crabMove, seconds());
    setRunning(true);
  }, [live, crabMove, moveKey]);

  const [stillFace, setStillFace] = useState<ReturnType<typeof crabReducedFace>>(null);
  useEffect(() => {
    if (live || !animated || !crabMove || !moveKey) return;
    const face = crabReducedFace(crabMove);
    if (!face) return;
    setStillFace(face);
    const timer = setTimeout(() => setStillFace(null), 800);
    return () => clearTimeout(timer);
  }, [live, animated, crabMove, moveKey]);
  const heldFace = !live && animated && activity ? crabReducedFace(activity) : null;
  const reducedShown = stillFace ?? heldFace;

  const shown = (running && live ? discrete : null) ?? reducedShown?.expression ?? null;
  const face = shown ?? expression ?? crabExpressionForMood(mood);

  useEffect(() => {
    if (!running || !live) return;
    let raf = 0;
    const clear = () => {
      for (const node of Object.values(groups.current)) {
        node?.removeAttribute("transform");
        if (node?.classList.contains("crab-sparkles")) node.setAttribute("opacity", "0");
      }
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const run = engine.current;
      if (!run || document.hidden) return;
      const now = seconds();
      const pose = run.pose(now);
      const transforms = crabTransforms(pose);
      for (const key of Object.keys(transforms) as CrabGroup[]) groups.current[key]?.setAttribute("transform", transforms[key]);
      groups.current.sparkles?.setAttribute("opacity", pose.spark.toFixed(3));
      setDiscrete((prev) => (prev === pose.expression ? prev : pose.expression));
      if (!keepRunning.current && !run.busy(now)) {
        cancelAnimationFrame(raf);
        clear();
        setDiscrete(null);
        setRunning(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [running, live]);

  const rigOn = running && live;
  const stillPose = !rigOn && reducedShown?.blink ? { ...crabRestPose(), blink: reducedShown.blink, expression: reducedShown.expression } : null;
  return (
    <span
      ref={root}
      className={cn("crab-mascot relative inline-flex shrink-0", animated && `crab-live crab-mood-${mood}`, rigOn && "crab-rig", className)}
      style={{ width: size, height: size }}
      data-character="crab"
      data-crab-skin={known}
      data-skin-tier={CRAB_SKIN_TIER[known]}
      data-expression={face}
      data-fx={full ? "full" : "static"}
      data-crab-move={crabMove ?? undefined}
      role={label ? "img" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      <Drawing fill={paint.fill} eyes={paint.eyes} shine={paint.shine} size={size} face={face} groups={rigOn ? groups : undefined} pose={stillPose} svgRef={body} />
    </span>
  );
}

export function CrabRewardArt({ skin, size, animated }: { skin: string; size: number; animated: boolean }) {
  return <CrabMascot skin={skin} color={CRAB_CORAL} size={size} animated={animated} detail="full" label={null} />;
}
