import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applyProjectFonts } from "@/lib/fonts";
import { absolutizeAssets } from "@/lib/ingestAsset";
import { uid } from "@/lib/id";
import { APP_VERSION, APP_BUILD, PLAY_PROTOCOL, versionStamp } from "@/lib/appVersion";
import { templateFromBlueprint } from "@/model/normalize";
import type { Template } from "@/model/types";
import { OnboardingDock } from "@/features/onboarding/OnboardingDock";
import { useAppStore } from "@/store/appStore";
import { useT } from "@/store/localeStore";
import { useOnboardingStore } from "@/store/onboardingStore";
import { cardLookStyle, TABLE_THEMES, WEATHERS, usePlayLookStore } from "@/store/playLookStore";
import { usePlayProfileStore } from "@/store/playProfileStore";
import { rememberHome } from "@/store/homeViewStore";
import { IconBtn } from "@/ui/IconBtn";
import {
  IconChevLeft,
  IconCircle,
  IconCopy,
  IconDice,
  IconErase,
  IconExpand,
  IconEye,
  IconFit,
  IconGrab,
  IconLine,
  IconLink,
  IconMinus,
  IconMusic,
  IconNote,
  IconPen,
  IconPlus,
  IconRect,
  IconRedo,
  IconRefresh,
  IconReturn,
  IconSave,
  IconStar,
  IconText,
  IconUndo,
  IconUsers,
} from "@/ui/Icons";
import { SiteTags } from "@/ui/Brand";
import { PlayAvatar } from "@/ui/PlayAvatar";
import { PrefsMenu } from "@/ui/PrefsMenu";
import { ContextMenu, type MenuItem } from "@/ui/ContextMenu";
import { CardThumb } from "../template/CardThumb";
import { PlayChat, type ChatMsg } from "./PlayChat";
import { PlayDrawLayer } from "./PlayDrawLayer";
import { BGM_TRACKS, playBgm, setBgmVolume, stopBgm, type BgmId } from "./playBgm";
import { PlayNotebook } from "./PlayNotebook";
import { PlayRoster } from "./PlayRoster";
import { PlayWeather } from "./PlayWeather";
import { PlayReview, reviewsToMarkdown } from "./PlayReview";
import { PlayPropView, PlayToolbox, tokenMenuItems } from "./PlayToolbox";
import { joinRoomGate, publishRoom, unpublishRoom } from "./roomsApi";
import { JoinWaitPanel } from "./JoinWaitPanel";
import {
  emptyJoinSteps,
  formatJoinReport,
  inspectJoinEnv,
  patchSteps,
  type DiagStep,
  type JoinEnv,
  type JoinKind,
} from "./joinDiag";
import { claimPlayerId, createPlayNet, loadPlayerId, newRoomCode, type PlayNet, type WanStatus } from "./playNet";
import { sendPlayBundle, makePackBuffer } from "./playSync";
import { playCardSrc, warmPlayCardCache, withPlayThumbUrls, type ResolveTpl } from "./playCardCache";
import { applyPlaySetup, buildPlaySetup } from "./playSetup";
import { propBox, spawnProp } from "./playProps";
import {
  CARD_W,
  TABLE,
  TABLE_PRESETS,
  clampOnTable,
  setTableDim,
  dealNToEach,
  isPileKey,
  passHandsClockwise,
  pieceSize,
  pileIdOf,
  pileKey,
  pileLayout,
  pileTop,
  faceForPile,
  primaryPile,
  setByName,
  shuffle,
  type TablePresetId,
} from "./playTable";
import { setPlayerColor, withRoomSeats, type CardReview, type Piece, type PlayEnvelope, type PlayPlayer, type PlayProp, type PlayStroke } from "./playTypes";

type MenuState = { x: number; y: number; pieceId?: string; pileId?: string; propId?: string };
type DragState =
  | { kind: "card"; id: string; ox: number; oy: number; fromPile?: string }
  | { kind: "pile"; pileId: string; ox: number; oy: number }
  | { kind: "pan"; ox: number; oy: number; panX: number; panY: number }
  | { kind: "prop"; id: string; ox: number; oy: number }
  | { kind: "draw"; id: string }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | {
      kind: "group";
      ids: string[];
      propIds: string[];
      pileIds: string[];
      ox: number;
      oy: number;
      origins: Record<string, { x: number; y: number }>;
      propOrigins: Record<string, { x: number; y: number }>;
      pileOrigins: Record<string, { x: number; y: number }>;
    };

function rectOf(a: { x0: number; y0: number; x1: number; y1: number }) {
  return {
    x: Math.min(a.x0, a.x1),
    y: Math.min(a.y0, a.y1),
    w: Math.abs(a.x1 - a.x0),
    h: Math.abs(a.y1 - a.y0),
  };
}

function hitsRect(x: number, y: number, w: number, h: number, r: { x: number; y: number; w: number; h: number }) {
  return x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y;
}

const HAND_H_MIN = 168;
const HAND_H_MAX = 460;
const HAND_H_DEFAULT = 320;
const LONG_PRESS_MS = 450;

function readHandH() {
  try {
    const n = Number(localStorage.getItem("ceditor-hand-h"));
    if (Number.isFinite(n)) return Math.max(HAND_H_MIN, Math.min(HAND_H_MAX, n));
  } catch {
    /* ignore */
  }
  return HAND_H_DEFAULT;
}
const MOVE_START_PX = 8;

function playJoinUrl(code: string, origin?: string) {
  const base = (origin ?? window.location.origin).replace(/\/$/, "");
  return `${base}/#/play?join=${encodeURIComponent(code)}`;
}

function cursorInk(bg: string) {
  const raw = bg.replace("#", "");
  const h = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (h.length < 6) return "#111114";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every(Number.isFinite)) return "#111114";
  return r * 0.299 + g * 0.587 + b * 0.114 > 155 ? "#111114" : "#f4f4f0";
}

export function PlayPage({ setupMode = false }: { setupMode?: boolean } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { current, close, setPlaySetup, setInfo } = useAppStore();
  const look = usePlayLookStore();
  const profile = usePlayProfileStore();
  const t = useT();
  const frameStyle = cardLookStyle(look);
  const feltRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const [meId, setMeId] = useState(() => loadPlayerId());
  const me = useMemo<PlayPlayer>(
    () => ({
      id: meId ?? "pl-pending",
      name: profile.name.trim() || t("play.player"),
      color: "",
      avatar: profile.avatar,
      gender: profile.gender,
      kind: profile.kind,
    }),
    [meId, profile.name, profile.avatar, profile.gender, profile.kind, t],
  );
  const joiningCode = setupMode ? "" : (params.get("join") ?? "").trim().toUpperCase();
  const [lobby, setLobby] = useState(setupMode ? false : !joiningCode);
  const [hostPrep, setHostPrep] = useState<{
    mode: "solo" | "host";
    code: string;
    failed: boolean;
    steps: DiagStep[];
    cardGot: number;
    cardTotal: number;
    hint: string;
  } | null>(null);
  const prepAbort = useRef({ aborted: false });
  const [role, setRole] = useState<"solo" | "host" | "guest">("solo");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [players, setPlayers] = useState<PlayPlayer[]>([me]);
  const [netHint, setNetHint] = useState("");
  const [wanBusy, setWanBusy] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);
  const [joinKind, setJoinKind] = useState<JoinKind | undefined>();
  const [joinSteps, setJoinSteps] = useState<DiagStep[]>(() => emptyJoinSteps());
  const [joinEnv, setJoinEnv] = useState<JoinEnv | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const zRef = useRef(10);
  const piecesRef = useRef(pieces);
  const dragRef = useRef(drag);
  const viewRef = useRef(view);
  const anchorsRef = useRef<Record<string, { x: number; y: number }>>({});
  const pressRef = useRef<{ pileId: string; sx: number; sy: number; timer: number } | null>(null);
  const cardPressRef = useRef<{ id: string; sx: number; sy: number; timer: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number; panX: number; panY: number; cx: number; cy: number } | null>(
    null,
  );
  const lastPtr = useRef({ x: 0, y: 0 });
  const [lanOrigins, setLanOrigins] = useState<string[]>([]);
  const [lanLoopback, setLanLoopback] = useState(false);
  const [altDown, setAltDown] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const lastCursorSend = useRef(0);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number; at: number }>>({});
  const [lookOpen, setLookOpen] = useState(false);
  const [bgmOpen, setBgmOpen] = useState(false);
  const [props, setProps] = useState<PlayProp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shuffleFx, setShuffleFx] = useState<{ pileId: string; x: number; y: number; at: number } | null>(null);
  const [spreadFx, setSpreadFx] = useState<{ at: number; ids: string[] } | null>(null);
  const [dealN, setDealN] = useState(4);
  const [clipUi, setClipUi] = useState<{ pileId: string; n: number; max: number } | null>(null);
  const [chats, setChats] = useState<ChatMsg[]>([]);
  const [packProg, setPackProg] = useState<{ got: number; total: number } | null>(null);
  const packBuf = useRef(makePackBuffer());
  const [tilts, setTilts] = useState<Record<string, number>>({});
  const lastFeltRef = useRef({ x: 0, y: 0, t: 0 });
  const tiltVelRef = useRef(0);
  const tiltDirRef = useRef(0);
  const [toolMode, setToolMode] = useState<"grab" | "draw" | "text">("grab");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [handH, setHandH] = useState(readHandH);
  const [peekSeat, setPeekSeat] = useState<string | null>(null);
  const [playFs, setPlayFs] = useState(false);
  const handHRef = useRef(handH);
  handHRef.current = handH;
  const [tablePreset, setTablePreset] = useState<TablePresetId>("m");
  const [tableCustom, setTableCustom] = useState({ w: 1680, h: 980 });
  const [bgmId, setBgmId] = useState<BgmId>("off");
  const [bgmVol, setBgmVol] = useState(0.28);
  const [handDrop, setHandDrop] = useState(false);
  const [inspectZoom, setInspectZoom] = useState(1);
  const [histN, setHistN] = useState({ past: 0, future: 0 });
  const [drawTool, setDrawTool] = useState<"pen" | "line" | "rect" | "ellipse" | "erase">("pen");
  const [drawColor, setDrawColor] = useState("#d6ff3c");
  const [strokes, setStrokes] = useState<PlayStroke[]>([]);
  const [reviews, setReviews] = useState<Record<string, CardReview>>({});
  const [reviewCard, setReviewCard] = useState<string | null>(null);
  const [peek, setPeek] = useState<{ title: string; names: string[] } | null>(null);
  const [roomPrivate, setRoomPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [roomMax, setRoomMax] = useState(8);
  const [roomSetOpen, setRoomSetOpen] = useState(false);
  const roomMaxRef = useRef(8);
  roomMaxRef.current = roomMax;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const netRef = useRef<PlayNet | null>(null);
  const joinAtRef = useRef(0);
  const joinPhaseRef = useRef<"env" | "signaling" | "host" | "channel" | "pack" | "done" | "fail">("env");
  const joinKindRef = useRef<JoinKind | undefined>(undefined);
  const joinEnvRef = useRef<JoinEnv | null>(null);
  const channelAtRef = useRef(0);
  const packProgRef = useRef<{ got: number; total: number } | null>(null);
  const applyingRef = useRef(false);
  const propsRef = useRef(props);
  const selectedRef = useRef(selected);
  propsRef.current = props;
  selectedRef.current = selected;
  const skipMenu = useRef(false);
  const applyRef = useRef<(msg: PlayEnvelope) => void>(() => undefined);
  const hotkeyRef = useRef<(k: string) => void>(() => undefined);
  const undoRef = useRef<() => void>(() => undefined);
  const redoRef = useRef<() => void>(() => undefined);
  const skipHistRef = useRef(false);
  const lastSnapRef = useRef<{ pieces: Piece[]; props: PlayProp[]; strokes: PlayStroke[] } | null>(null);
  const histRef = useRef<{ past: { pieces: Piece[]; props: PlayProp[]; strokes: PlayStroke[] }[]; future: { pieces: Piece[]; props: PlayProp[]; strokes: PlayStroke[] }[] }>({
    past: [],
    future: [],
  });
  const templatesRef = useRef(new Map<string, { front: Template; back: Template }>());
  const roleRef = useRef(role);
  roleRef.current = role;

  const logNet = useCallback((text: string) => {
    const line = text.trim();
    if (!line) return;
    setChats((list) => {
      const last = list[list.length - 1];
      if (last?.from === "system" && last.text === line) return list;
      return [...list.slice(-100), { id: uid("sys"), from: "system", name: "系统", text: line, at: Date.now() }];
    });
  }, []);
  const verWarned = useRef(false);

  const handleWan = useCallback((s: WanStatus) => {
    if (s.kind) {
      joinKindRef.current = s.kind;
      setJoinKind(s.kind);
    }
    if (s.step === "broker") {
      joinPhaseRef.current = s.phase === "failed" ? "fail" : "signaling";
      setJoinSteps((list) => patchSteps(list, "signaling", s.phase === "failed" ? "fail" : "wait", s.detail));
    }
    if (s.step === "peer") {
      joinPhaseRef.current = s.phase === "failed" ? "fail" : "host";
      setJoinSteps((list) =>
        patchSteps(patchSteps(list, "signaling", "ok"), "host", s.phase === "failed" ? "fail" : "wait", s.detail),
      );
    }
    if (s.step === "channel" && s.phase === "connected") {
      joinPhaseRef.current = "channel";
      channelAtRef.current = Date.now();
      setJoinSteps((list) => patchSteps(patchSteps(list, "host", "ok"), "pack", "wait", s.detail));
    }
    if (s.step === "channel" && s.phase === "connecting") {
      joinPhaseRef.current = "host";
      setJoinSteps((list) => patchSteps(list, "host", "wait", s.detail));
    }
    if (s.phase === "connecting") setWanBusy(true);
    if (s.phase === "connected" && roleRef.current !== "guest") setWanBusy(false);
    if (s.phase === "failed") {
      joinPhaseRef.current = "fail";
      setJoinFailed(true);
      setWanBusy(false);
      setNetHint(s.detail);
      if (s.step === "channel") setJoinSteps((list) => patchSteps(list, "pack", "fail", s.detail));
    } else if (s.detail) {
      setNetHint(s.detail);
    }
    const line = s.detail.trim();
    if (!line) return;
    setChats((list) => {
      const last = list[list.length - 1];
      if (last?.from === "system" && last.text === line) return list;
      return [...list.slice(-100), { id: uid("sys"), from: "system", name: "系统", text: line, at: Date.now() }];
    });
  }, []);
  const playersRef = useRef(players);
  playersRef.current = players;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  piecesRef.current = pieces;
  dragRef.current = drag;
  viewRef.current = view;
  packProgRef.current = packProg;
  joinEnvRef.current = joinEnv;
  joinKindRef.current = joinKind;
  for (const set of current?.sets ?? []) {
    const top = pileTop(pieces, set.id);
    if (top) anchorsRef.current[set.id] = { x: top.x, y: top.y };
  }

  useEffect(() => {
    if (current) void applyProjectFonts(current);
  }, [current]);

  useEffect(() => () => stopBgm(), []);

  useEffect(() => {
    if (joiningCode) setJoinCode(joiningCode);
  }, [joiningCode]);

  useEffect(() => {
    let live = true;
    void claimPlayerId().then((id) => {
      if (live && id !== meId) setMeId(id);
    });
    const failSafe = window.setTimeout(() => {
      setMeId((cur) => cur || loadPlayerId());
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(failSafe);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setPlayFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        e.preventDefault();
        if (!e.repeat) setInspectZoom(1);
        setAltDown(true);
      }
      const typing = e.target as HTMLElement | null;
      if (typing && (typing.tagName === "INPUT" || typing.tagName === "TEXTAREA" || typing.isContentEditable || typing.closest(".play-note"))) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current.size) {
        const ids = selectedRef.current;
        setProps((list) => list.filter((p) => !ids.has(p.id)));
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
        return;
      }
      if (key === "q" || key === "e" || key === "f" || key === "g" || key === "r" || /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        hotkeyRef.current?.(e.key === key ? key : e.key);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltDown(false);
    };
    const clear = () => setAltDown(false);
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea, input, .play-note, .play-notebook")) return;
      e.preventDefault();
      setInspectZoom((z) => Math.min(2.6, Math.max(0.5, z * (e.deltaY > 0 ? 0.88 : 1.14))));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    void fetch("/__lan")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { origins?: string[]; loopbackOnly?: boolean } | null) => {
        if (data?.origins?.length) setLanOrigins(data.origins);
        setLanLoopback(Boolean(data?.loopbackOnly));
      })
      .catch(() => undefined);
  }, []);

  const bumpZ = () => {
    zRef.current += 1;
    return zRef.current;
  };

  const feltXY = (e: { clientX: number; clientY: number }) => {
    const rect = feltRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (e.clientX - (rect?.left ?? 0) - v.panX) / v.zoom,
      y: (e.clientY - (rect?.top ?? 0) - v.panY) / v.zoom,
    };
  };

  function grabFromEvent(e: { clientX: number; clientY: number; currentTarget?: EventTarget | null }, fallbackX: number, fallbackY: number) {
    const start = feltXY(e);
    const el = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (el) {
      const rect = el.getBoundingClientRect();
      const tl = feltXY({ clientX: rect.left, clientY: rect.top });
      return { ox: start.x - tl.x, oy: start.y - tl.y, x: tl.x, y: tl.y, start };
    }
    return { ox: start.x - fallbackX, oy: start.y - fallbackY, x: fallbackX, y: fallbackY, start };
  }

  function resetTiltTrack(px: number) {
    lastFeltRef.current = { x: px, y: 0, t: performance.now() };
    tiltVelRef.current = 0;
    tiltDirRef.current = 0;
  }

  function tiltFromMove(px: number) {
    const now = performance.now();
    const prev = lastFeltRef.current;
    const dt = Math.max(8, now - (prev.t || now));
    const dx = px - prev.x;
    lastFeltRef.current = { x: px, y: prev.y, t: now };
    if (Math.abs(dx) > 0.35) tiltDirRef.current = Math.sign(dx);
    const vx = (dx / dt) * 1000;
    tiltVelRef.current = tiltVelRef.current * 0.55 + vx * 0.45;
    const fromSpeed = Math.max(-32, Math.min(32, tiltVelRef.current * 0.12));
    const floor = tiltDirRef.current * (Math.abs(dx) > 0.35 ? 18 : Math.min(18, Math.abs(tiltVelRef.current) * 0.05));
    return Math.abs(fromSpeed) > Math.abs(floor) ? fromSpeed : floor;
  }

  const broadcastState = useCallback(
    (nextPieces?: Piece[], nextPlayers?: PlayPlayer[], nextProps?: PlayProp[]) => {
      const net = netRef.current;
      if (!net || !current || !roomId) return;
      net.send({
        from: me.id,
        kind: "state",
        projectId: current.meta.id,
        pieces: nextPieces ?? piecesRef.current,
        players: nextPlayers ?? players,
        props: nextProps ?? propsRef.current,
        strokes: strokesRef.current,
      });
    },
    [current, me.id, players, roomId],
  );

  function pushHostTable(nextPlayers?: PlayPlayer[]) {
    void (async () => {
      const { current: hostProject, currentPath } = useAppStore.getState();
      const net = netRef.current;
      if (!net || !hostProject) return;
      const project =
        currentPath && !currentPath.includes("联机")
          ? { ...hostProject, assets: absolutizeAssets(hostProject.assets ?? {}, currentPath) }
          : hostProject;
      let pieces = piecesRef.current;
      const resolve: ResolveTpl = (piece, forceFace) => {
        const set = hostProject.sets.find((s) => s.id === piece.setId);
        const pair = set ? templatesRef.current.get(set.blueprintId) : undefined;
        const face = forceFace ?? piece.face;
        return face === "front" ? pair?.front : pair?.back;
      };
      try {
        logNet("正在预渲染联机卡牌…");
        await warmPlayCardCache(pieces, project, resolve);
        pieces = withPlayThumbUrls(pieces, resolve);
        piecesRef.current = pieces;
        setPieces(pieces);
      } catch (err) {
        logNet(`预渲染失败：${err instanceof Error ? err.message : "unknown"}`);
      }
      sendPlayBundle(net, me.id, {
        project,
        players: nextPlayers ?? playersRef.current,
        pieces,
        props: propsRef.current,
        strokes: strokesRef.current,
      });
    })();
  }

  const applyRemote = (msg: PlayEnvelope) => {
    if (msg.from === me.id) return;
    if (!verWarned.current && (msg.appVersion || msg.protocol != null)) {
      if (msg.protocol != null && msg.protocol !== PLAY_PROTOCOL) {
        verWarned.current = true;
        logNet(t("play.protoMismatch", { theirs: msg.protocol, mine: PLAY_PROTOCOL }));
      } else if (
        (msg.appVersion && msg.appVersion !== APP_VERSION) ||
        (msg.build && msg.build !== APP_BUILD)
      ) {
        verWarned.current = true;
        const theirs = msg.build ? `v${msg.appVersion} · ${msg.build}` : `v${msg.appVersion}`;
        logNet(t("play.verMismatch", { theirs, mine: versionStamp() }));
      }
    }
    if (msg.kind === "pack" && msg.packId && typeof msg.packIndex === "number" && msg.packBody != null && msg.packTotal) {
      const next = packBuf.current.push(msg.packId, msg.packIndex, msg.packTotal, msg.packBody);
      setPackProg({ got: next.got, total: next.total });
      joinPhaseRef.current = "pack";
      setJoinSteps((list) => patchSteps(list, "pack", next.error ? "fail" : "wait", t("play.netPack", { got: next.got, total: next.total })));
      if (next.error) {
        joinPhaseRef.current = "fail";
        joinKindRef.current = "pack";
        setJoinKind("pack");
        setJoinFailed(true);
        setWanBusy(false);
        const msgText = `牌组数据解析失败（${next.error}）。是卡牌同步损坏，不是房号问题。`;
        setNetHint(msgText);
        logNet(msgText);
        return;
      }
      if (!next.bundle) return;
      applyingRef.current = true;
      joinPhaseRef.current = "done";
      useAppStore.getState().adoptPlayProject(next.bundle.project);
      setPlayers(withRoomSeats(next.bundle.players.length ? next.bundle.players : playersRef.current));
      setPieces(next.bundle.pieces);
      setProps(next.bundle.props);
      setStrokes(next.bundle.strokes);
      setLobby(false);
      setWanBusy(false);
      setJoinFailed(false);
      setPackProg(null);
      logNet("已收到房主牌组，正在进入桌面…");
      return;
    }
    const live = useAppStore.getState().current;
    if (msg.project && !live) {
      useAppStore.getState().adoptPlayProject(msg.project);
    }
    if (msg.projectId && live && msg.projectId !== live.meta.id && msg.kind !== "hello" && msg.kind !== "bye" && msg.kind !== "chat" && msg.kind !== "cursor" && msg.kind !== "pack") {
      logNet("对方打开的不是同一个项目。手机端只需加入房号，不必先打开工程。");
      return;
    }
    if (msg.kind === "cursor" && msg.cursor) {
      setRemoteCursors((m) => ({ ...m, [msg.from]: { x: msg.cursor!.x, y: msg.cursor!.y, at: Date.now() } }));
      return;
    }
    if (msg.kind === "hello" && msg.players?.[0]) {
      if (roleRef.current !== "host") return;
      if (msg.projectId && live && msg.projectId !== live.meta.id) {
        logNet("对方本地开着另一个项目。已按房主桌上的工程进房。");
      }
      setWanBusy(false);
      setPlayers((list) => {
        const incoming = msg.players![0];
        if (list.some((p) => p.id === incoming.id)) {
          const next = withRoomSeats(list.map((p) => (p.id === incoming.id ? { ...p, ...incoming, host: p.host } : p)));
          pushHostTable(next);
          return next;
        }
        if (list.length >= roomMaxRef.current) {
          netRef.current?.send({ from: me.id, kind: "kick", targetId: incoming.id });
          return list;
        }
        const next = withRoomSeats([...list, { ...incoming, color: incoming.color || "", team: incoming.team ?? `p${Math.min(4, list.length + 1)}` }]);
        pushHostTable(next);
        return next;
      });
      setLobby(false);
      return;
    }
    if (msg.kind === "roster" && msg.players) {
      setWanBusy(false);
      setPlayers(withRoomSeats(msg.players));
      if (msg.pieces) {
        applyingRef.current = true;
        setPieces(msg.pieces);
      }
      if (msg.props) {
        applyingRef.current = true;
        setProps(msg.props);
      }
      if (msg.strokes) setStrokes(msg.strokes);
      setLobby(false);
      return;
    }
    if (msg.kind === "state") {
      if (msg.players) setPlayers(withRoomSeats(msg.players));
      if (msg.pieces) {
        applyingRef.current = true;
        setPieces(msg.pieces);
      }
      if (msg.props) {
        applyingRef.current = true;
        setProps(msg.props);
      }
      if (msg.strokes) setStrokes(msg.strokes);
      setLobby(false);
    }
    if (msg.kind === "kick" && msg.targetId === me.id) {
      if ((msg.at || 0) < joinAtRef.current - 1500) return;
      netRef.current?.close();
      netRef.current = null;
      setRoomId(null);
      setRole("solo");
      setNetHint("房主将你移出了房间");
      logNet("房主将你移出了房间");
      rememberHome({ mode: "play", playTab: "join" });
      navigate("/app");
      return;
    }
    if (msg.kind === "kick" && msg.targetId) {
      setRemoteCursors((m) => {
        if (!(msg.targetId! in m)) return m;
        const next = { ...m };
        delete next[msg.targetId!];
        return next;
      });
    }
    if (msg.kind === "seat" && msg.players?.[0] && roleRef.current === "host") {
      const req = msg.players[0];
      setPlayers((list) => {
        const next = withRoomSeats(
          list.map((p) => {
            if (p.id !== req.id) return p;
            return {
              ...p,
              name: req.name?.trim() || p.name,
              avatar: req.avatar ?? p.avatar,
              gender: req.gender ?? p.gender,
              kind: req.kind ?? p.kind,
              color: req.color !== undefined ? req.color : p.color,
              team: req.team ?? p.team,
            };
          }),
        );
        netRef.current?.send({
          from: me.id,
          kind: "roster",
          projectId: useAppStore.getState().current?.meta.id,
          players: next,
        });
        return next;
      });
    }
    if (msg.kind === "bye") {
      setRemoteCursors((m) => {
        if (!(msg.from in m)) return m;
        const next = { ...m };
        delete next[msg.from];
        return next;
      });
      setPlayers((list) => {
        const left = list.filter((p) => p.id !== msg.from);
        const hostLeft = list.some((p) => p.id === msg.from && p.host);
        if (hostLeft && left.length) {
          left[0] = { ...left[0], host: true };
        }
        return withRoomSeats(left);
      });
    }
    if (msg.kind === "chat" && msg.text) {
      const text = msg.text;
      setChats((list) => [
        ...list,
        {
          id: msg.id,
          from: msg.from,
          name: msg.name ?? msg.players?.[0]?.name ?? "玩家",
          text,
          at: msg.at,
        },
      ]);
    }
  };
  applyRef.current = applyRemote;

  useEffect(() => {
    return () => {
      const code = roomIdRef.current;
      const others = playersRef.current.filter((p) => p.id !== me.id);
      netRef.current?.send({ from: me.id, kind: "bye" });
      netRef.current?.close();
      if (code && others.length === 0) void unpublishRoom(code);
    };
  }, [me.id]);

  function centerTableView(zoom = 1) {
    const felt = feltRef.current;
    if (!felt) return { zoom, panX: 0, panY: 0 };
    const r = felt.getBoundingClientRect();
    return {
      zoom,
      panX: (r.width - TABLE.w * zoom) / 2,
      panY: (r.height - TABLE.h * zoom) / 2,
    };
  }

  useEffect(() => {
    if (lobby && !setupMode) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames += 1;
      if (feltRef.current && feltRef.current.getBoundingClientRect().width > 40) {
        setView(centerTableView(1));
        return;
      }
      if (frames < 30) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lobby, setupMode, current?.meta.id]);

  const reset = useCallback(() => {
    if (!current) return;
    const next = applyPlaySetup(current);
    Object.assign(anchorsRef.current, next.anchors);
    applyingRef.current = false;
    void (async () => {
      const { currentPath } = useAppStore.getState();
      const project =
        currentPath && !currentPath.includes("联机")
          ? { ...current, assets: absolutizeAssets(current.assets ?? {}, currentPath) }
          : current;
      const resolve: ResolveTpl = (piece, forceFace) => {
        const set = project.sets.find((s) => s.id === piece.setId);
        const pair = set ? templatesRef.current.get(set.blueprintId) : undefined;
        const face = forceFace ?? piece.face;
        return face === "front" ? pair?.front : pair?.back;
      };
      let warmed = next.pieces;
      if (roomId) {
        try {
          await warmPlayCardCache(warmed, project, resolve);
          warmed = withPlayThumbUrls(warmed, resolve);
        } catch {
          /* fallback drawCard */
        }
      }
      piecesRef.current = warmed;
      setPieces(warmed);
      setProps(next.props);
      zRef.current = Math.max(20, ...warmed.map((p) => p.z), ...next.props.map((p) => p.z));
      broadcastState(warmed, undefined, next.props);
    })();
  }, [broadcastState, current, roomId]);

  function resetToDeal() {
    if (!current) return;
    const next = buildPlaySetup(current);
    Object.assign(anchorsRef.current, next.anchors);
    applyingRef.current = false;
    setPieces(next.pieces);
    setProps(next.props);
    zRef.current = Math.max(20, ...next.pieces.map((p) => p.z), ...next.props.map((p) => p.z));
    if (!setupMode) broadcastState(next.pieces, undefined, next.props);
  }

  function saveTableSetup() {
    if (!current) return;
    setPlaySetup({ pieces: structuredClone(pieces), props: structuredClone(props) });
    setInfo("默认桌面已保存。开房试玩会按这个布置发牌和道具。");
  }

  useEffect(() => {
    if (hostPrep) return;
    if (!lobby && current && pieces.length === 0 && role !== "guest") reset();
  }, [lobby, current, pieces.length, reset, role, hostPrep]);

  useEffect(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    if (!roomId || lobby || drag) return;
    const t = window.setTimeout(() => broadcastState(), 60);
    return () => window.clearTimeout(t);
  }, [pieces, props, roomId, lobby, drag, broadcastState]);

  useEffect(() => {
    if (!roomId || role === "guest" || lobby) return;
    const hostName = players.find((p) => p.host)?.name || me.name;
    const beat = () => {
      void publishRoom({
        id: roomId,
        name: current?.meta.name ?? "试玩房",
        hostName,
        players: players.length,
        maxPlayers: roomMax,
        private: roomPrivate,
        password: roomPassword || undefined,
        version: APP_VERSION,
        protocol: PLAY_PROTOCOL,
      });
    };
    beat();
    const timer = window.setInterval(beat, 4000);
    return () => window.clearInterval(timer);
  }, [roomId, role, lobby, players, roomMax, roomPrivate, roomPassword, current?.meta.name, me.name]);

  useEffect(() => {
    const amHost = players.some((p) => p.host && p.id === me.id);
    if (!amHost || !roomId || lobby || role !== "guest") return;
    setRole("host");
    const code = roomId;
    const timer = window.setTimeout(() => {
      joinAtRef.current = Date.now();
      netRef.current?.close();
      netRef.current = createPlayNet(code, (m) => applyRef.current(m), {
        wan: true,
        asHost: true,
        onWan: handleWan,
        onPeer: () => pushHostTable(),
      });
      netRef.current.send({
        from: me.id,
        kind: "roster",
        projectId: useAppStore.getState().current?.meta.id,
        players: playersRef.current,
        pieces: piecesRef.current,
        props: propsRef.current,
        strokes: strokesRef.current,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [players, role, roomId, lobby, me.id]);

  useEffect(() => {
    if (lobby || !roomId) {
      setLatencyMs(null);
      return;
    }
    let live = true;
    const ping = async () => {
      const t0 = performance.now();
      try {
        await fetch("/__ping", { cache: "no-store" });
        if (live) setLatencyMs(Math.round(performance.now() - t0));
      } catch {
        if (live) setLatencyMs(null);
      }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 4000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [lobby, roomId]);

  useEffect(() => {
    if (lobby || drag) return;
    const cur = {
      pieces: structuredClone(piecesRef.current),
      props: structuredClone(propsRef.current),
      strokes: structuredClone(strokesRef.current),
    };
    if (skipHistRef.current) {
      skipHistRef.current = false;
      lastSnapRef.current = cur;
      return;
    }
    if (roleRef.current === "guest") {
      lastSnapRef.current = cur;
      return;
    }
    const prev = lastSnapRef.current;
    lastSnapRef.current = cur;
    if (!prev) return;
    if (JSON.stringify(prev) === JSON.stringify(cur)) return;
    histRef.current.past.push(prev);
    if (histRef.current.past.length > 60) histRef.current.past.shift();
    histRef.current.future = [];
    setHistN({ past: histRef.current.past.length, future: 0 });
  }, [pieces, props, strokes, lobby, drag]);

  useEffect(() => {
    if (current) Object.assign(anchorsRef.current, pileLayout(current));
    const hit = (x: number, y: number, ignore?: string) => {
      for (const pileId of current?.sets.map((s) => s.id) ?? []) {
        if (pileId === ignore) continue;
        const top = pileTop(piecesRef.current, pileId);
        const pos = top ?? anchorsRef.current[pileId];
        if (!pos) continue;
        const sz = current ? pieceSize(current, pileId) : { w: CARD_W, h: CARD_W * 1.4 };
        if (x >= pos.x - 16 && x <= pos.x + sz.w + 16 && y >= pos.y - 16 && y <= pos.y + sz.h + 16) {
          return pileId;
        }
      }
      return undefined;
    };
    const peelTop = (pileId: string, clientX: number, clientY: number) => {
      const top = pileTop(piecesRef.current, pileId);
      if (!top) return;
      const { x: px, y: py } = feltXY({ clientX, clientY });
      resetTiltTrack(px);
      setDrag({ kind: "card", id: top.id, ox: px - top.x, oy: py - top.y, fromPile: pileId });
      setPieces((list) =>
        list.map((p) => (p.id === top.id ? { ...p, zone: "table", pileId: undefined, ownerId: undefined, z: bumpZ() } : p)),
      );
    };
    const clearPress = () => {
      const p = pressRef.current;
      if (p) window.clearTimeout(p.timer);
      pressRef.current = null;
      const c = cardPressRef.current;
      if (c) window.clearTimeout(c.timer);
      cardPressRef.current = null;
    };

    const overHand = (cx: number, cy: number) => {
      const dock = handRef.current?.getBoundingClientRect();
      if (!dock) return false;
      const pad = 28;
      return cx >= dock.left - pad && cx <= dock.right + pad && cy >= dock.top - 36 && cy <= dock.bottom + pad;
    };
    const move = (e: globalThis.PointerEvent) => {
      lastPtr.current = { x: e.clientX, y: e.clientY };
      setCursor({ x: e.clientX, y: e.clientY });
      if (roomIdRef.current && netRef.current) {
        const now = performance.now();
        if (now - lastCursorSend.current > 70) {
          lastCursorSend.current = now;
          const p = feltXY(e);
          netRef.current.send({ from: me.id, kind: "cursor", cursor: { x: p.x, y: p.y } });
        }
      }
      const draggingCard = dragRef.current?.kind === "card" || dragRef.current?.kind === "group";
      setHandDrop(Boolean(draggingCard && overHand(e.clientX, e.clientY)));
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointersRef.current.values()];
      if (pts.length >= 2) {
        clearPress();
        if (dragRef.current?.kind !== "pan") setDrag(null);
        const rect = feltRef.current?.getBoundingClientRect();
        const cx = (pts[0].x + pts[1].x) / 2 - (rect?.left ?? 0);
        const cy = (pts[0].y + pts[1].y) / 2 - (rect?.top ?? 0);
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (!pinchRef.current) {
          const v = viewRef.current;
          pinchRef.current = { dist: Math.max(1, dist), zoom: v.zoom, panX: v.panX, panY: v.panY, cx, cy };
        } else {
          const origin = pinchRef.current;
          const zoom = Math.min(3.2, Math.max(0.35, origin.zoom * (dist / origin.dist)));
          const wx = (origin.cx - origin.panX) / origin.zoom;
          const wy = (origin.cy - origin.panY) / origin.zoom;
          setView({ zoom, panX: cx - wx * zoom, panY: cy - wy * zoom });
        }
        skipMenu.current = true;
        return;
      }
      const d = dragRef.current;
      if (d?.kind === "pan") {
        setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.ox), panY: d.panY + (e.clientY - d.oy) }));
        skipMenu.current = true;
        return;
      }
      if (d?.kind === "draw") {
        const p = feltXY(e);
        setStrokes((list) =>
          list.map((s) => (s.id === d.id ? { ...s, points: s.tool === "pen" ? [...s.points, p] : [s.points[0], p] } : s)),
        );
        return;
      }
      if (d?.kind === "marquee") {
        const p = feltXY(e);
        setDrag({ ...d, x1: p.x, y1: p.y });
        return;
      }
      if (d?.kind === "group") {
        const { x: px, y: py } = feltXY(e);
        const dx = px - d.ox;
        const dy = py - d.oy;
        const tilt = tiltFromMove(px);
        setTilts((m) => {
          const next = { ...m };
          for (const id of d.ids) next[id] = tilt;
          for (const id of d.pileIds) next[pileKey(id)] = tilt;
          return next;
        });
        setPieces((list) =>
          list.map((p) => {
            if (p.zone === "pile" && p.pileId && d.pileIds.includes(p.pileId)) {
              const o = d.pileOrigins[p.pileId];
              if (!o) return p;
              const sz = current ? pieceSize(current, p.setId) : { w: CARD_W, h: CARD_W * 1.4 };
              return { ...p, ...clampOnTable(o.x + dx, o.y + dy, sz.w, sz.h) };
            }
            if (!d.ids.includes(p.id)) return p;
            const o = d.origins[p.id];
            if (!o) return p;
            const sz = current ? pieceSize(current, p.setId) : { w: CARD_W, h: CARD_W * 1.4 };
            return { ...p, ...clampOnTable(o.x + dx, o.y + dy, sz.w, sz.h), zone: "table", pileId: undefined, ownerId: undefined };
          }),
        );
        setProps((list) =>
          list.map((p) => {
            if (!d.propIds.includes(p.id)) return p;
            const o = d.propOrigins[p.id];
            if (!o) return p;
            const sz = propBox(p);
            const pos = clampOnTable(o.x + dx, o.y + dy, sz.w, sz.h);
            return { ...p, ...pos };
          }),
        );
        return;
      }
      if (d?.kind === "prop") {
        const { x: px, y: py } = feltXY(e);
        const prop = propsRef.current.find((p) => p.id === d.id);
        const sz = prop ? propBox(prop) : { w: 48, h: 48 };
        const pos = clampOnTable(px - d.ox, py - d.oy, sz.w, sz.h);
        setProps((list) => list.map((p) => (p.id === d.id ? { ...p, ...pos } : p)));
        return;
      }
      const cardPress = cardPressRef.current;
      if (cardPress && !d) {
        if (Math.hypot(e.clientX - cardPress.sx, e.clientY - cardPress.sy) > MOVE_START_PX) {
          const id = cardPress.id;
          clearPress();
          const piece = piecesRef.current.find((p) => p.id === id);
          if (piece) {
            const g = grabFromEvent(e, piece.x, piece.y);
            resetTiltTrack(g.start.x);
            setDrag({ kind: "card", id: piece.id, ox: g.ox, oy: g.oy });
            setPieces((list) =>
              list.map((p) =>
                p.id === piece.id
                  ? { ...p, x: g.x, y: g.y, z: bumpZ(), zone: "table", ownerId: undefined }
                  : p,
              ),
            );
          }
        }
        return;
      }
      const press = pressRef.current;
      if (press && !d) {
        if (Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > MOVE_START_PX) {
          const pileId = press.pileId;
          clearPress();
          peelTop(pileId, e.clientX, e.clientY);
        }
        return;
      }
      if (!d) return;
      const { x: px, y: py } = feltXY(e);
      const x = px - d.ox;
      const y = py - d.oy;
      if (d.kind === "pile") {
        const sz = current ? pieceSize(current, d.pileId) : { w: CARD_W, h: CARD_W * 1.4 };
        const pos = clampOnTable(x, y, sz.w, sz.h);
        setTilts((m) => ({ ...m, [pileKey(d.pileId)]: tiltFromMove(px) }));
        setPieces((list) => list.map((p) => (p.zone === "pile" && p.pileId === d.pileId ? { ...p, ...pos } : p)));
        return;
      }
      if (d.kind === "card") {
        const piece = piecesRef.current.find((p) => p.id === d.id);
        const sz = current && piece ? pieceSize(current, piece.setId) : { w: CARD_W, h: CARD_W * 1.4 };
        const pos = clampOnTable(x, y, sz.w, sz.h);
        setTilts((m) => ({ ...m, [d.id]: tiltFromMove(px) }));
        setPieces((list) => list.map((p) => (p.id === d.id ? { ...p, ...pos, zone: "table", pileId: undefined } : p)));
      }
    };

    const up = (e: globalThis.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      clearPress();
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "card") setTilts((m) => ({ ...m, [d.id]: 0 }));
      if (d.kind === "pile") setTilts((m) => ({ ...m, [pileKey(d.pileId)]: 0 }));
      if (d.kind === "group") {
        setTilts((m) => {
          const next = { ...m };
          for (const id of d.ids) next[id] = 0;
          for (const id of d.pileIds) next[pileKey(id)] = 0;
          return next;
        });
      }
      if (d.kind === "draw") {
        setDrag(null);
        return;
      }
      if (d.kind === "pan") {
        setDrag(null);
        setHandDrop(false);
        return;
      }
      if (d.kind === "marquee") {
        const r = rectOf(d);
        if (r.w < 6 && r.h < 6) {
          if (!d.add) setSelected(new Set());
          setDrag(null);
          return;
        }
        const next = d.add ? new Set(selectedRef.current) : new Set<string>();
        for (const p of piecesRef.current) {
          if (p.zone !== "table") continue;
          const sz = current ? pieceSize(current, p.setId) : { w: CARD_W, h: CARD_W * 1.4 };
          if (hitsRect(p.x, p.y, sz.w, sz.h, r)) next.add(p.id);
        }
        for (const set of current?.sets ?? []) {
          const top = pileTop(piecesRef.current, set.id);
          const pos = top ?? anchorsRef.current[set.id];
          if (!pos) continue;
          const sz = current ? pieceSize(current, set.id) : { w: CARD_W, h: CARD_W * 1.4 };
          if (hitsRect(pos.x, pos.y, sz.w, sz.h, r)) next.add(pileKey(set.id));
        }
        for (const p of propsRef.current) {
          const sz = propBox(p);
          if (hitsRect(p.x, p.y, sz.w, sz.h, r)) next.add(p.id);
        }
        setSelected(next);
        setDrag(null);
        setHandDrop(false);
        return;
      }
      if (d.kind === "prop") {
        setDrag(null);
        setHandDrop(false);
        return;
      }
      if (d.kind === "group") {
        const toHand = overHand(e.clientX, e.clientY);
        if (toHand) {
          setPieces((list) =>
            list.map((p) =>
              d.ids.includes(p.id) ? { ...p, zone: "hand", pileId: undefined, ownerId: me.id, face: "front", z: bumpZ() } : p,
            ),
          );
        }
        setDrag(null);
        setHandDrop(false);
        return;
      }
      const { x, y } = feltXY(e);
      const toHand = overHand(e.clientX, e.clientY);
      if (d.kind === "pile") {
        const overPile = hit(x, y, d.pileId);
        if (overPile) {
          const others = piecesRef.current.filter((p) => p.pileId !== d.pileId);
          const target = pileTop(others, overPile);
          const pos = target ?? anchorsRef.current[overPile];
          const face = faceForPile(others, overPile, current);
          setPieces((cur) =>
            cur.map((p) =>
              p.zone === "pile" && p.pileId === d.pileId
                ? {
                    ...p,
                    pileId: overPile,
                    face,
                    rot: target?.rot ?? p.rot ?? 0,
                    x: pos?.x ?? p.x,
                    y: pos?.y ?? p.y,
                    z: bumpZ(),
                  }
                : p,
            ),
          );
        }
        setDrag(null);
        return;
      }
      const overPile = hit(x, y);
      setPieces((cur) =>
        cur.map((p) => {
          if (p.id !== d.id) return p;
          if (toHand) return { ...p, zone: "hand", pileId: undefined, ownerId: me.id, face: "front", z: bumpZ() };
          if (overPile) {
            const top = pileTop(cur.filter((q) => q.id !== p.id), overPile);
            const anchor = anchorsRef.current[overPile];
            const face = faceForPile(
              cur.filter((q) => q.id !== p.id),
              overPile,
              current,
            );
            return {
              ...p,
              zone: "pile",
              pileId: overPile,
              face,
              ownerId: undefined,
              rot: top?.rot ?? 0,
              x: top?.x ?? anchor?.x ?? p.x,
              y: top?.y ?? anchor?.y ?? p.y,
              z: bumpZ(),
            };
          }
          const sz = current ? pieceSize(current, p.setId) : { w: CARD_W, h: CARD_W * 1.4 };
          return { ...p, ...clampOnTable(p.x, p.y, sz.w, sz.h), zone: "table", pileId: undefined, ownerId: undefined };
        }),
      );
      setDrag(null);
      setHandDrop(false);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [current, me.id]);

  const templates = useMemo(() => {
    const map = new Map<string, { front: Template; back: Template }>();
    if (!current) return map;
    for (const bp of current.blueprints) {
      map.set(bp.id, {
        front: templateFromBlueprint(bp, "front"),
        back: templateFromBlueprint(bp, "back"),
      });
    }
    return map;
  }, [current]);
  templatesRef.current = templates;

  useEffect(() => {
    if (role === "guest" || !current || lobby || !roomId) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const { currentPath } = useAppStore.getState();
        const project =
          currentPath && !currentPath.includes("联机")
            ? { ...current, assets: absolutizeAssets(current.assets ?? {}, currentPath) }
            : current;
        const resolve: ResolveTpl = (piece, forceFace) => {
          const set = project.sets.find((s) => s.id === piece.setId);
          const pair = set ? templatesRef.current.get(set.blueprintId) : undefined;
          const face = forceFace ?? piece.face;
          return face === "front" ? pair?.front : pair?.back;
        };
        try {
          await warmPlayCardCache(piecesRef.current, project, resolve);
          const warmed = withPlayThumbUrls(piecesRef.current, resolve);
          if (warmed.some((p, i) => p.thumbUrl !== piecesRef.current[i]?.thumbUrl)) {
            piecesRef.current = warmed;
            setPieces(warmed);
          }
        } catch {
          /* ignore warm errors during play */
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [pieces, role, current, lobby, roomId]);

  const piles = useMemo(() => {
    const ids = new Set(pieces.filter((p) => p.zone === "pile" && p.pileId).map((p) => p.pileId!));
    return [...ids];
  }, [pieces]);

  const myHand = useMemo(
    () =>
      pieces
        .filter((p) => p.zone === "hand" && (p.ownerId === me.id || (!p.ownerId && players.length <= 1)))
        .sort((a, b) => a.z - b.z),
    [pieces, me.id, players.length],
  );
  const table = useMemo(() => pieces.filter((p) => p.zone === "table"), [pieces]);
  const others = players.filter((p) => p.id !== me.id);
  const myColor = players.find((p) => p.id === me.id)?.color || profile.color || "#d6ff3c";

  function tplFor(piece: Piece, forceFace?: "front" | "back") {
    const set = current?.sets.find((s) => s.id === piece.setId);
    const pair = set ? templates.get(set.blueprintId) : undefined;
    const face = forceFace ?? piece.face;
    return face === "front" ? pair?.front : pair?.back;
  }

  function trackPointer(e: PointerEvent) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) {
      if (pressRef.current) window.clearTimeout(pressRef.current.timer);
      pressRef.current = null;
      if (cardPressRef.current) window.clearTimeout(cardPressRef.current.timer);
      cardPressRef.current = null;
      setDrag(null);
    }
  }

  function startGroupDrag(start: { x: number; y: number }, sel: Set<string>) {
    resetTiltTrack(start.x);
    const ids = [...sel].filter((id) => piecesRef.current.some((p) => p.id === id));
    const propIds = [...sel].filter((id) => propsRef.current.some((p) => p.id === id));
    const pileIds = [...sel].filter(isPileKey).map(pileIdOf);
    const origins: Record<string, { x: number; y: number }> = {};
    const propOrigins: Record<string, { x: number; y: number }> = {};
    const pileOrigins: Record<string, { x: number; y: number }> = {};
    for (const p of piecesRef.current) if (ids.includes(p.id)) origins[p.id] = { x: p.x, y: p.y };
    for (const p of propsRef.current) if (propIds.includes(p.id)) propOrigins[p.id] = { x: p.x, y: p.y };
    for (const pileId of pileIds) {
      const top = pileTop(piecesRef.current, pileId);
      const pos = top ?? anchorsRef.current[pileId];
      if (pos) pileOrigins[pileId] = { x: pos.x, y: pos.y };
    }
    setDrag({ kind: "group", ids, propIds, pileIds, ox: start.x, oy: start.y, origins, propOrigins, pileOrigins });
  }

  function beginDrag(e: PointerEvent, piece: Piece) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackPointer(e);
    lastPtr.current = { x: e.clientX, y: e.clientY };
    if (e.shiftKey) {
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(piece.id)) next.delete(piece.id);
        else next.add(piece.id);
        return next;
      });
    } else if (!selectedRef.current.has(piece.id)) {
      setSelected(new Set([piece.id]));
    }
    const group = !e.shiftKey && selectedRef.current.has(piece.id) && selectedRef.current.size > 1;
    if (group) {
      startGroupDrag(feltXY(e), selectedRef.current);
      return;
    }
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      if (cardPressRef.current) window.clearTimeout(cardPressRef.current.timer);
      const timer = window.setTimeout(() => {
        const c = cardPressRef.current;
        cardPressRef.current = null;
        if (!c || dragRef.current) return;
        setMenu({ x: lastPtr.current.x, y: lastPtr.current.y, pieceId: c.id });
      }, LONG_PRESS_MS);
      cardPressRef.current = { id: piece.id, sx: e.clientX, sy: e.clientY, timer };
      return;
    }
    const g = grabFromEvent(e, piece.x, piece.y);
    resetTiltTrack(g.start.x);
    setDrag({ kind: "card", id: piece.id, ox: g.ox, oy: g.oy });
    setPieces((list) =>
      list.map((p) =>
        p.id === piece.id ? { ...p, x: g.x, y: g.y, z: bumpZ(), zone: "table", ownerId: undefined } : p,
      ),
    );
  }

  function beginPropDrag(e: PointerEvent, prop: PlayProp) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackPointer(e);
    if (e.shiftKey) {
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(prop.id)) next.delete(prop.id);
        else next.add(prop.id);
        return next;
      });
    } else if (!selectedRef.current.has(prop.id)) {
      setSelected(new Set([prop.id]));
    }
    const group = !e.shiftKey && selectedRef.current.has(prop.id) && selectedRef.current.size > 1;
    const start = feltXY(e);
    if (group) {
      startGroupDrag(start, selectedRef.current);
      return;
    }
    setDrag({ kind: "prop", id: prop.id, ox: start.x - prop.x, oy: start.y - prop.y });
  }

  function patchProp(id: string, patch: Partial<PlayProp>) {
    setProps((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addProp(kind: PlayProp["kind"], extra?: Partial<PlayProp>, at?: { x: number; y: number }) {
    const next = spawnProp(kind, props.length, extra);
    if (at) {
      const sz = propBox(next);
      const pos = clampOnTable(at.x - sz.w / 2, at.y - sz.h / 2, sz.w, sz.h);
      next.x = pos.x;
      next.y = pos.y;
    }
    setProps((list) => [...list, next]);
    setSelected(new Set([next.id]));
  }

  function onPilePointerDown(e: PointerEvent, pileId: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackPointer(e);
    lastPtr.current = { x: e.clientX, y: e.clientY };
    const key = pileKey(pileId);
    if (e.shiftKey) {
      setSelected((cur) => {
        const next = new Set(cur);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    if (selectedRef.current.has(key)) {
      startGroupDrag(feltXY(e), selectedRef.current);
      return;
    }
    if (pressRef.current) window.clearTimeout(pressRef.current.timer);
    const timer = window.setTimeout(() => {
      const p = pressRef.current;
      pressRef.current = null;
      if (!p || dragRef.current) return;
      const top = pileTop(piecesRef.current, p.pileId);
      const pos = top ?? anchorsRef.current[p.pileId];
      if (!pos) return;
      const { x: px, y: py } = feltXY({ clientX: lastPtr.current.x, clientY: lastPtr.current.y });
      resetTiltTrack(px);
      setDrag({ kind: "pile", pileId: p.pileId, ox: px - pos.x, oy: py - pos.y });
    }, LONG_PRESS_MS);
    pressRef.current = { pileId, sx: e.clientX, sy: e.clientY, timer };
  }

  function onFeltPointerDown(e: PointerEvent<HTMLDivElement>) {
    trackPointer(e);
    if (toolMode === "text" && e.button === 0) {
      e.preventDefault();
      const p = feltXY(e);
      addProp("textbox", { x: p.x, y: p.y, text: "文本" });
      setToolMode("grab");
      return;
    }
    if (toolMode === "draw" && e.button === 0) {
      e.preventDefault();
      const p = feltXY(e);
      if (drawTool === "erase") {
        setStrokes((list) =>
          list.filter((s) => !s.points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 16)),
        );
        return;
      }
      const stroke: PlayStroke = {
        id: `ink-${Date.now()}`,
        tool: drawTool,
        color: drawColor,
        width: 3,
        points: [p],
      };
      setStrokes((list) => [...list, stroke]);
      setDrag({ kind: "draw", id: stroke.id });
      return;
    }
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setDrag({ kind: "pan", ox: e.clientX, oy: e.clientY, panX: view.panX, panY: view.panY });
      return;
    }
    if (e.button === 0) {
      const p = feltXY(e);
      setDrag({ kind: "marquee", x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey });
    }
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const node = e.target as HTMLElement | null;
    if (node?.closest("textarea, input, select, .play-notebook, .play-review-dock, .play-look-panel")) return;
    const propEl = node?.closest(".play-prop") as HTMLElement | null;
    if (propEl?.dataset.propId && (node?.closest(".play-note") || propEl.classList.contains("play-prop-note"))) {
      e.preventDefault();
      e.stopPropagation();
      const id = propEl.dataset.propId;
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setProps((list) =>
        list.map((p) =>
          p.id === id ? { ...p, scale: Math.min(2.8, Math.max(0.45, Math.round(((p.scale ?? 1) + delta) * 100) / 100)) } : p,
        ),
      );
      return;
    }
    if (e.altKey) return;
    e.preventDefault();
    const rect = feltRef.current?.getBoundingClientRect();
    const cx = e.clientX - (rect?.left ?? 0);
    const cy = e.clientY - (rect?.top ?? 0);
    const factor = e.deltaY > 0 ? 0.9 : 1.11;
    setView((v) => {
      const zoom = Math.min(3.2, Math.max(0.35, v.zoom * factor));
      const wx = (cx - v.panX) / v.zoom;
      const wy = (cy - v.panY) / v.zoom;
      return { zoom, panX: cx - wx * zoom, panY: cy - wy * zoom };
    });
  }

  function selectionPieceIds(list: Piece[], sel: Set<string> = selectedRef.current): Set<string> {
    const ids = new Set<string>();
    for (const id of sel) {
      if (isPileKey(id)) {
        const pid = pileIdOf(id);
        for (const p of list) {
          if (p.zone === "pile" && p.pileId === pid) ids.add(p.id);
        }
      } else {
        ids.add(id);
      }
    }
    return ids;
  }

  function flipIds(ids: Set<string>) {
    if (!ids.size) return;
    setPieces((list) =>
      list.map((p) =>
        ids.has(p.id) ? { ...p, face: p.face === "front" ? "back" : "front", z: bumpZ() } : p,
      ),
    );
  }

  function flip(id: string) {
    const sel = selectedRef.current;
    if (sel.size > 1 && sel.has(id)) {
      flipIds(selectionPieceIds(piecesRef.current, sel));
      return;
    }
    flipIds(new Set([id]));
  }

  function flipPile(pileId: string) {
    const sel = selectedRef.current;
    const key = pileKey(pileId);
    if (sel.size > 1 && sel.has(key)) {
      flipIds(selectionPieceIds(piecesRef.current, sel));
      return;
    }
    setPieces((list) =>
      list.map((p) =>
        p.zone === "pile" && p.pileId === pileId
          ? { ...p, face: p.face === "front" ? "back" : "front" }
          : p,
      ),
    );
  }

  function setRot(id: string, rot: number) {
    const sel = selectedRef.current;
    if (sel.size > 1 && sel.has(id)) {
      const ids = selectionPieceIds(piecesRef.current, sel);
      setPieces((list) => list.map((p) => (ids.has(p.id) ? { ...p, rot, z: bumpZ() } : p)));
      return;
    }
    setPieces((list) => list.map((p) => (p.id === id ? { ...p, rot, z: bumpZ() } : p)));
  }

  function rotateBy(id: string, delta: number) {
    const sel = selectedRef.current;
    if (sel.size > 1 && sel.has(id)) {
      const ids = selectionPieceIds(piecesRef.current, sel);
      setPieces((list) =>
        list.map((p) =>
          ids.has(p.id)
            ? { ...p, rot: (((p.rot ?? 0) + delta) % 360 + 360) % 360, z: bumpZ() }
            : p,
        ),
      );
      return;
    }
    setPieces((list) =>
      list.map((p) =>
        p.id === id ? { ...p, rot: (((p.rot ?? 0) + delta) % 360 + 360) % 360, z: bumpZ() } : p,
      ),
    );
  }

  function rotatePile(pileId: string, delta: number) {
    const sel = selectedRef.current;
    const key = pileKey(pileId);
    if (sel.size > 1 && sel.has(key)) {
      const ids = selectionPieceIds(piecesRef.current, sel);
      setPieces((list) =>
        list.map((p) =>
          ids.has(p.id)
            ? { ...p, rot: (((p.rot ?? 0) + delta) % 360 + 360) % 360, z: bumpZ() }
            : p,
        ),
      );
      return;
    }
    setPieces((list) =>
      list.map((p) =>
        p.zone === "pile" && p.pileId === pileId
          ? { ...p, rot: (((p.rot ?? 0) + delta) % 360 + 360) % 360 }
          : p,
      ),
    );
  }

  function setPileRot(pileId: string, rot: number) {
    setPieces((list) =>
      list.map((p) => (p.zone === "pile" && p.pileId === pileId ? { ...p, rot } : p)),
    );
  }

  function drawToHand(pileId: string, n = 1) {
    useOnboardingStore.getState().complete("try-play");
    setPieces((list) => {
      const tops = list
        .filter((p) => p.zone === "pile" && p.pileId === pileId)
        .sort((a, b) => a.z - b.z)
        .slice(-n);
      const ids = new Set(tops.map((t) => t.id));
      return list.map((p) =>
        ids.has(p.id) ? { ...p, zone: "hand" as const, face: "front" as const, ownerId: me.id, pileId: undefined, z: bumpZ() } : p,
      );
    });
  }

  function shufflePile(pileId: string) {
    const top = pileTop(piecesRef.current, pileId);
    setShuffleFx({ pileId, x: top?.x ?? 80, y: top?.y ?? 80, at: Date.now() });
    window.setTimeout(() => setShuffleFx((fx) => (fx?.pileId === pileId ? null : fx)), 700);
    setPieces((list) => {
      const inPile = list.filter((p) => p.zone === "pile" && p.pileId === pileId);
      const others = list.filter((p) => !(p.zone === "pile" && p.pileId === pileId));
      const order = shuffle(inPile);
      const pos = pileTop(list, pileId);
      const face = faceForPile(list, pileId, current);
      return [
        ...others,
        ...order.map((p, i) => ({
          ...p,
          face,
          rot: pos?.rot ?? p.rot ?? 0,
          x: pos?.x ?? p.x,
          y: pos?.y ?? p.y,
          z: i + 1,
        })),
      ];
    });
  }

  function clipPile(pileId: string, n: number) {
    setPieces((list) => {
      const inPile = list.filter((p) => p.zone === "pile" && p.pileId === pileId).sort((a, b) => a.z - b.z);
      if (inPile.length < 2) return list;
      const take = Math.max(1, Math.min(n, inPile.length));
      const others = list.filter((p) => !(p.zone === "pile" && p.pileId === pileId));
      const topCards = inPile.slice(-take);
      const rest = inPile.slice(0, -take);
      const newId = uid("pile");
      const pos = pileTop(list, pileId);
      const nx = (pos?.x ?? 80) + 120;
      const ny = pos?.y ?? 80;
      anchorsRef.current[newId] = { x: nx, y: ny };
      return [
        ...others,
        ...rest.map((p, i) => ({ ...p, z: i + 1 })),
        ...topCards.map((p, i) => ({ ...p, pileId: newId, x: nx, y: ny, z: i + 1 })),
      ];
    });
    setClipUi(null);
    setSelected(new Set());
  }

  function splitPile(pileId: string, parts: number) {
    setPieces((list) => {
      const inPile = list.filter((p) => p.zone === "pile" && p.pileId === pileId).sort((a, b) => a.z - b.z);
      if (parts < 2 || inPile.length < parts) return list;
      const others = list.filter((p) => !(p.zone === "pile" && p.pileId === pileId));
      const pos = pileTop(list, pileId);
      const base = Math.floor(inPile.length / parts);
      const extra = inPile.length % parts;
      const next = [...others];
      let offset = 0;
      for (let i = 0; i < parts; i++) {
        const count = base + (i < extra ? 1 : 0);
        const chunk = inPile.slice(offset, offset + count);
        offset += count;
        const id = i === 0 ? pileId : uid("pile");
        const x = (pos?.x ?? 80) + i * 120;
        const y = pos?.y ?? 80;
        anchorsRef.current[id] = { x, y };
        chunk.forEach((p, zi) => next.push({ ...p, pileId: id, x, y, z: zi + 1 }));
      }
      return next;
    });
    setSelected(new Set());
  }

  function spreadPile(pileId: string) {
    const list = piecesRef.current;
    const inPile = list.filter((p) => p.zone === "pile" && p.pileId === pileId).sort((a, b) => a.z - b.z);
    const top = pileTop(list, pileId);
    const keepFace = top?.face ?? "back";
    const keepRot = top?.rot ?? 0;
    const gap = Math.max(28, Math.round((pieceSize(current!, top?.setId ?? current!.sets[0]?.id ?? "").w || CARD_W) * 0.22));
    const ids = inPile.map((p) => p.id);
    setSpreadFx({ at: Date.now(), ids });
    window.setTimeout(() => setSpreadFx((fx) => (fx?.at ? null : fx)), 900);
    setPieces((cur) =>
      cur.map((p) => {
        if (!(p.zone === "pile" && p.pileId === pileId)) return p;
        const i = inPile.findIndex((x) => x.id === p.id);
        return {
          ...p,
          zone: "table" as const,
          pileId: undefined,
          face: keepFace,
          rot: keepRot,
          x: (top?.x ?? 80) + i * gap,
          y: top?.y ?? 80,
          z: i + 1,
        };
      }),
    );
    setSelected(new Set(ids));
  }

  function mergeSelected() {
    const cardIds = [...selectedRef.current].filter((id) => piecesRef.current.some((p) => p.id === id));
    const fromPiles = [...selectedRef.current].filter(isPileKey).map(pileIdOf);
    const members = piecesRef.current.filter(
      (p) => cardIds.includes(p.id) || (p.zone === "pile" && p.pileId && fromPiles.includes(p.pileId)),
    );
    if (members.length < 2) return;
    const pileId = `merge-${uid("pile")}`;
    const x = members.reduce((s, p) => s + p.x, 0) / members.length;
    const y = members.reduce((s, p) => s + p.y, 0) / members.length;
    const ids = new Set(members.map((p) => p.id));
    const face = members[0]?.face ?? "back";
    const rot = members[0]?.rot ?? 0;
    setPieces((list) =>
      list.map((p, i) =>
        ids.has(p.id)
          ? { ...p, zone: "pile" as const, pileId, x, y, ownerId: undefined, face, rot, z: i + 1 }
          : p,
      ),
    );
    setSelected(new Set([pileKey(pileId)]));
    anchorsRef.current[pileId] = { x, y };
  }

  function hoverTarget(): { pieceId?: string; pileId?: string } {
    if (!hoverId) return {};
    if (hoverId.startsWith("pile:")) return { pileId: hoverId.slice(5) };
    return { pieceId: hoverId };
  }

  hotkeyRef.current = (key) => {
    const { pieceId, pileId } = hoverTarget();
    const sel = selectedRef.current;
    if (key === "g") {
      mergeSelected();
      return;
    }
    if (key === "r") {
      if (pileId) shufflePile(pileId);
      return;
    }
    if (key === "f") {
      if (sel.size > 1) {
        flipIds(selectionPieceIds(piecesRef.current, sel));
      } else if (pileId) {
        flipPile(pileId);
      } else if (pieceId) {
        flip(pieceId);
      }
      return;
    }
    if (key === "q" || key === "e") {
      const delta = key === "q" ? -90 : 90;
      if (sel.size > 1) {
        const ids = selectionPieceIds(piecesRef.current, sel);
        setPieces((list) =>
          list.map((p) =>
            ids.has(p.id)
              ? { ...p, rot: (((p.rot ?? 0) + delta) % 360 + 360) % 360, z: bumpZ() }
              : p,
          ),
        );
      } else if (pileId) {
        rotatePile(pileId, delta);
      } else if (pieceId) {
        rotateBy(pieceId, delta);
      }
      return;
    }
    if (/^[1-9]$/.test(key) && pileId) {
      drawToHand(pileId, Number(key));
    }
  };

  function applySnap(snap: { pieces: Piece[]; props: PlayProp[]; strokes: PlayStroke[] }) {
    skipHistRef.current = true;
    applyingRef.current = true;
    lastSnapRef.current = structuredClone(snap);
    strokesRef.current = snap.strokes;
    setPieces(snap.pieces);
    setProps(snap.props);
    setStrokes(snap.strokes);
    broadcastState(snap.pieces, undefined, snap.props);
  }

  function roomUndo() {
    if (role === "guest") return;
    const prev = histRef.current.past.pop();
    if (!prev) return;
    const cur = lastSnapRef.current ?? {
      pieces: structuredClone(piecesRef.current),
      props: structuredClone(propsRef.current),
      strokes: structuredClone(strokesRef.current),
    };
    histRef.current.future.push(structuredClone(cur));
    applySnap(prev);
    setHistN({ past: histRef.current.past.length, future: histRef.current.future.length });
  }

  function roomRedo() {
    if (role === "guest") return;
    const next = histRef.current.future.pop();
    if (!next) return;
    const cur = lastSnapRef.current ?? {
      pieces: structuredClone(piecesRef.current),
      props: structuredClone(propsRef.current),
      strokes: structuredClone(strokesRef.current),
    };
    histRef.current.past.push(structuredClone(cur));
    applySnap(next);
    setHistN({ past: histRef.current.past.length, future: histRef.current.future.length });
  }
  undoRef.current = roomUndo;
  redoRef.current = roomRedo;

  function applyTablePreset(id: TablePresetId) {
    setTablePreset(id);
    const found = TABLE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    if (id === "custom") setTableDim(tableCustom.w, tableCustom.h);
    else setTableDim(found.w, found.h);
  }

  function drawPileId() {
    return primaryPile(current!)?.id ?? piles[0];
  }

  function dealEach(n: number) {
    const pileId = drawPileId();
    if (!pileId) return;
    setPieces((list) => dealNToEach(list, pileId, players, n));
  }

  function passHands() {
    setPieces((list) => passHandsClockwise(list, players));
  }

  function returnHand() {
    setPieces((list) => {
      const firstPile = primaryPile(current!)?.id ?? piles[0];
      const top = firstPile ? pileTop(list, firstPile) : undefined;
      const face = firstPile ? faceForPile(list, firstPile, current) : "back";
      return list.map((p) =>
        p.zone === "hand"
          ? {
              ...p,
              zone: "pile" as const,
              pileId: firstPile,
              face,
              ownerId: undefined,
              rot: top?.rot ?? 0,
              x: top?.x ?? 80,
              y: top?.y ?? 120,
              z: bumpZ(),
            }
          : p,
      );
    });
  }

  function sendChat(text: string) {
    const local: ChatMsg = {
      id: `${me.id}-${Date.now()}`,
      from: me.id,
      name: me.name,
      text,
      at: Date.now(),
    };
    setChats((list) => [...list, local]);
    netRef.current?.send({ from: me.id, kind: "chat", text, name: me.name });
  }

  function cancelPrep() {
    prepAbort.current.aborted = true;
    const code = hostPrep?.code;
    netRef.current?.close();
    netRef.current = null;
    if (code) void unpublishRoom(code);
    setHostPrep(null);
    setRoomId(null);
    setRole("solo");
    setLobby(true);
    setPieces([]);
  }

  async function beginOpenRoom(mode: "solo" | "host") {
    if (!current) return;
    prepAbort.current = { aborted: false };
    const aborted = () => prepAbort.current.aborted;
    const code = mode === "host" ? newRoomCode() : "";
    const steps0: DiagStep[] = [
      { id: "table", status: "wait" },
      { id: "cards", status: "wait" },
      { id: "net", status: "wait" },
    ];
    setHostPrep({
      mode,
      code,
      failed: false,
      steps: steps0,
      cardGot: 0,
      cardTotal: 0,
      hint: t("play.prep.lead"),
    });
    try {
      const next = applyPlaySetup(current);
      Object.assign(anchorsRef.current, next.anchors);
      if (aborted()) return;
      setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "table", "ok") });

      const { currentPath } = useAppStore.getState();
      const project =
        currentPath && !currentPath.includes("联机")
          ? { ...current, assets: absolutizeAssets(current.assets ?? {}, currentPath) }
          : current;
      const resolve: ResolveTpl = (piece, forceFace) => {
        const set = project.sets.find((s) => s.id === piece.setId);
        const pair = templatesRef.current.get(set?.blueprintId ?? "");
        const face = forceFace ?? piece.face;
        return face === "front" ? pair?.front : pair?.back;
      };
      setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "cards", "wait") });
      await warmPlayCardCache(next.pieces, project, resolve, (got, total) => {
        if (aborted()) return;
        setHostPrep((p) =>
          p && {
            ...p,
            cardGot: got,
            cardTotal: total,
            steps: patchSteps(p.steps, "cards", "wait", t("play.prep.cardsNote", { got, total })),
          },
        );
      });
      if (aborted()) return;
      const warmed = withPlayThumbUrls(next.pieces, resolve);
      setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "cards", "ok", t("play.prep.cardsNote", { got: p.cardGot, total: p.cardTotal })) });

      if (mode === "host") {
        setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "net", "wait") });
        verWarned.current = false;
        const host = withRoomSeats([{ ...me, color: profile.color || "", team: "p1", host: true }])[0];
        netRef.current?.close();
        netRef.current = createPlayNet(code, (m) => applyRef.current(m), {
          wan: true,
          asHost: true,
          onWan: handleWan,
          onPeer: () => pushHostTable(),
        });
        netRef.current.send({ from: me.id, kind: "hello", projectId: current.meta.id, players: [host] });
        await publishRoom({
          id: code,
          name: current.meta.name ?? "试玩房",
          hostName: host.name,
          players: 1,
          maxPlayers: roomMax,
          private: roomPrivate,
          password: roomPassword || undefined,
          version: APP_VERSION,
          protocol: PLAY_PROTOCOL,
        });
        if (aborted()) {
          netRef.current?.close();
          netRef.current = null;
          void unpublishRoom(code);
          return;
        }
        const phoneLinks = (lanOrigins.length ? lanOrigins : [window.location.origin]).map((o) => playJoinUrl(code, o));
        logNet(t("play.hostLanHint", { code, url: phoneLinks[0] ?? playJoinUrl(code) }));
        setPlayers([{ ...host, host: true }]);
        setRole("host");
        setRoomId(code);
        setWanBusy(true);
        joinAtRef.current = Date.now();
        setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "net", "ok") });
      } else {
        setPlayers(withRoomSeats([{ ...me, color: profile.color || "", team: "p1", host: true }]));
        setRoomId(null);
        setRole("solo");
        setHostPrep((p) => p && { ...p, steps: patchSteps(p.steps, "net", "skip", t("play.prep.netSkip")) });
      }
      if (aborted()) return;
      piecesRef.current = warmed;
      setPieces(warmed);
      setProps(next.props);
      zRef.current = Math.max(20, ...warmed.map((p) => p.z), ...next.props.map((p) => p.z));
      setNetHint("");
      setLobby(false);
      setHostPrep(null);
    } catch (err) {
      if (aborted()) return;
      const msg = err instanceof Error ? err.message : "unknown";
      setHostPrep((p) =>
        p && {
          ...p,
          failed: true,
          hint: msg,
          steps: p.steps.map((s) => (s.status === "wait" ? { ...s, status: "fail" as const, note: msg } : s)),
        },
      );
    }
  }

  function startSolo() {
    void beginOpenRoom("solo");
  }

  function startHost() {
    void beginOpenRoom("host");
  }

  function leaveSeat() {
    const code = roomId;
    verWarned.current = false;
    const others = playersRef.current.filter((p) => p.id !== me.id);
    netRef.current?.send({ from: me.id, kind: "bye" });
    netRef.current?.close();
    netRef.current = null;
    if (code && others.length === 0) void unpublishRoom(code);
    setRoomId(null);
    setRole("solo");
    setPlayers([{ ...me, color: profile.color || "", host: true }]);
    setNetHint("");
  }

  function goHome(tab: "host" | "join" | "profile" = "host") {
    rememberHome({ mode: "play", playTab: tab });
    close();
    navigate("/app");
  }

  function backFromTable() {
    if (setupMode) {
      navigate("/project/template");
      return;
    }
    const wasGuest = role === "guest" || Boolean(joiningCode);
    leaveSeat();
    if (wasGuest) {
      goHome("join");
      return;
    }
    setLobby(true);
  }

  function backFromLobby() {
    goHome(current ? "host" : "join");
  }

  async function joinRoom(codeOverride?: string) {
    const code = (codeOverride ?? joinCode).trim().toUpperCase();
    if (code.length < 3) {
      setNetHint("请输入房号");
      return;
    }
    const guest: PlayPlayer = { ...me, color: profile.color || "", team: "p1" };
    verWarned.current = false;
    setJoinFailed(false);
    setJoinKind(undefined);
    setJoinSteps(emptyJoinSteps());
    setJoinEnv(null);
    joinPhaseRef.current = "env";
    channelAtRef.current = 0;
    setRole("guest");
    setRoomId(code);
    joinAtRef.current = Date.now();
    setWanBusy(true);
    setLobby(false);
    setNetHint(t("play.netConnecting"));
    logNet(`正在加入 ${code}…`);

    const env = await inspectJoinEnv(code);
    setJoinEnv(env);
    joinEnvRef.current = env;
    let steps = emptyJoinSteps();
    const mark = (id: string, status: DiagStep["status"], note?: string) => {
      steps = patchSteps(steps, id, status, note);
    };

    if (!env.online) {
      mark("env", "fail", t("play.fail.offline"));
      setJoinSteps(steps);
      joinPhaseRef.current = "fail";
      setJoinKind("offline");
      setJoinFailed(true);
      setWanBusy(false);
      setNetHint(t("play.fail.offline"));
      logNet(t("play.fail.offline"));
      return;
    }
    if (!env.localhost) {
      const detail = t("play.fail.address") + `：当前 ${env.host}。异地必须用 http://localhost:1420/ 再填房号。`;
      mark("env", "fail", detail);
      setJoinSteps(steps);
      joinPhaseRef.current = "fail";
      setJoinKind("address");
      setJoinFailed(true);
      setWanBusy(false);
      setNetHint(detail);
      logNet(detail);
      return;
    }
    mark("env", "ok", env.host);

    if (!env.studioOk) {
      mark("studio", "fail", t("play.fail.studio.h"));
      setJoinSteps(steps);
      joinPhaseRef.current = "fail";
      setJoinKind("studio");
      setJoinFailed(true);
      setWanBusy(false);
      setNetHint(t("play.fail.studio.h"));
      logNet(t("play.fail.studio.h"));
      return;
    }
    mark("studio", "ok", env.version ? `v${env.version}` : "ok");

    let pw = roomPassword || (location.state as { password?: string } | null)?.password || "";
    let gate = env.localRoom;
    if (gate === "pw") {
      pw = window.prompt(t("play.roomPw")) ?? "";
      if (!pw) {
        setNetHint("房间私密或密码不对");
        if (joiningCode) goHome("join");
        return;
      }
      setRoomPassword(pw);
      gate = await joinRoomGate(code, pw);
    }
    if (gate === "full") {
      mark("local", "fail", t("play.full"));
      setJoinSteps(steps);
      setNetHint(t("play.full"));
      setJoinFailed(true);
      setJoinKind("room");
      setWanBusy(false);
      if (joiningCode) goHome("join");
      return;
    }
    if (gate === "offline") {
      mark("local", "fail", t("play.fail.studio.h"));
      setJoinSteps(steps);
      joinPhaseRef.current = "fail";
      setJoinKind("studio");
      setJoinFailed(true);
      setWanBusy(false);
      setNetHint(t("play.fail.studio.h"));
      return;
    }
    if (gate === "gone") {
      mark("local", "skip", "本地没有这个房（不同网络正常），改走互联网");
    } else {
      mark("local", "ok", "本机工坊上已有此房");
    }
    mark("signaling", "wait");
    setJoinSteps(steps);
    joinPhaseRef.current = "signaling";

    netRef.current?.close();
    netRef.current = createPlayNet(code, (m) => applyRef.current(m), {
      wan: true,
      asHost: false,
      onWan: handleWan,
      onPeer: () => {
        netRef.current?.send({ from: me.id, kind: "hello", players: [guest] });
      },
    });
    const hello = () => netRef.current?.send({ from: me.id, kind: "hello", players: [guest] });
    hello();
    window.setTimeout(hello, 800);
    window.setTimeout(hello, 2000);
    window.setTimeout(hello, 4000);
    setPlayers((list) => (list.some((p) => p.id === guest.id) ? list : withRoomSeats([...list, guest])));
  }

  const joinOnce = useRef(false);
  useEffect(() => {
    if (!meId || setupMode || !joiningCode || joinOnce.current) return;
    joinOnce.current = true;
    void joinRoom(joiningCode);
  }, [joiningCode, meId, setupMode]);

  useEffect(() => {
    if (setupMode || role !== "guest" || current) return;
    const timer = window.setInterval(() => {
      if (useAppStore.getState().current) return;
      const phase = joinPhaseRef.current;
      if (phase === "fail" || phase === "done") return;
      const now = Date.now();
      if (phase === "signaling" && now - joinAtRef.current > 18000) {
        joinPhaseRef.current = "fail";
        joinKindRef.current = "signaling";
        setJoinKind("signaling");
        setJoinFailed(true);
        setWanBusy(false);
        const msg = t("play.timeout.signaling");
        setNetHint(msg);
        setJoinSteps((list) => patchSteps(list, "signaling", "fail", msg));
        logNet(msg);
        return;
      }
      if (phase === "host" && now - joinAtRef.current > 90000) {
        joinPhaseRef.current = "fail";
        joinKindRef.current = "room";
        setJoinKind("room");
        setJoinFailed(true);
        setWanBusy(false);
        const msg = t("play.timeout.room");
        setNetHint(msg);
        setJoinSteps((list) => patchSteps(list, "host", "fail", msg));
        logNet(msg);
        return;
      }
      if ((phase === "channel" || phase === "pack") && channelAtRef.current && now - channelAtRef.current > 22000) {
        joinPhaseRef.current = "fail";
        joinKindRef.current = "pack";
        setJoinKind("pack");
        setJoinFailed(true);
        setWanBusy(false);
        const pack = packProgRef.current;
        const msg = pack
          ? t("play.timeout.packPart", { got: pack.got, total: pack.total })
          : t("play.timeout.pack");
        setNetHint(msg);
        setJoinSteps((list) => patchSteps(list, "pack", "fail", msg));
        logNet(msg);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [role, current, setupMode, logNet, t]);

  useEffect(() => {
    if (!roomId || lobby || setupMode) return;
    setPlayers((list) => {
      const next = withRoomSeats(
        list.map((p) =>
          p.id === me.id
            ? { ...p, name: me.name, avatar: me.avatar, gender: me.gender, kind: me.kind }
            : p,
        ),
      );
      const mine = next.find((p) => p.id === me.id);
      if (!mine) return next;
      if (roleRef.current === "guest") {
        netRef.current?.send({ from: me.id, kind: "seat", players: [mine] });
      } else {
        netRef.current?.send({
          from: me.id,
          kind: "roster",
          projectId: useAppStore.getState().current?.meta.id,
          players: next,
        });
      }
      return next;
    });
  }, [profile.name, profile.avatar, profile.gender, profile.kind, roomId, lobby, setupMode, me.id, me.name, me.avatar, me.gender, me.kind]);

  function pushRoster(next: PlayPlayer[]) {
    setPlayers(next);
    if (roomId && role !== "guest") {
      netRef.current?.send({
        from: me.id,
        kind: "roster",
        projectId: current?.meta.id,
        players: next,
      });
    }
  }

  function changePlayerColor(id: string, color: string) {
    if (role === "guest") {
      netRef.current?.send({ from: me.id, kind: "seat", players: [{ ...me, color, team: players.find((p) => p.id === id)?.team }] });
      return;
    }
    pushRoster(setPlayerColor(players, id, color));
  }

  function kickPlayer(id: string) {
    if (role === "guest" || id === me.id) return;
    netRef.current?.send({ from: me.id, kind: "kick", targetId: id });
    setRemoteCursors((m) => {
      if (!(id in m)) return m;
      const next = { ...m };
      delete next[id];
      return next;
    });
    pushRoster(players.filter((p) => p.id !== id));
  }

  const selectedCards = [...selected].filter((id) => pieces.some((p) => p.id === id));
  const menuItems: MenuItem[] = menu?.propId
    ? tokenMenuItems(
        props.find((p) => p.id === menu.propId) ?? { id: menu.propId, kind: "cube", x: 0, y: 0, z: 0 },
        patchProp,
        () => {
          setProps((list) => list.filter((p) => p.id !== menu.propId));
          setSelected((cur) => {
            const next = new Set(cur);
            next.delete(menu.propId!);
            return next;
          });
        },
      )
    : menu?.pileId
    ? [
        { label: "抽 1 到手上", onClick: () => drawToHand(menu.pileId!, 1) },
        {
          label: "发牌",
          submenu: [
            { label: "抽 5 到手上", onClick: () => drawToHand(menu.pileId!, 5) },
            { label: "每位 1 张", onClick: () => dealEach(1) },
            { label: `每位 ${dealN} 张`, onClick: () => dealEach(dealN) },
          ],
        },
        { label: "洗牌", onClick: () => shufflePile(menu.pileId!) },
        { label: "一字展开", onClick: () => spreadPile(menu.pileId!) },
        {
          label: "看顶 5 张",
          onClick: () => {
            const tops = pieces
              .filter((p) => p.zone === "pile" && p.pileId === menu.pileId)
              .sort((a, b) => a.z - b.z)
              .slice(-5)
              .reverse();
            setPeek({
              title: "顶牌",
              names: tops.map((p) => p.card.fields.name || p.card.fields.rank || p.card.id),
            });
          },
        },
        {
          label: "搜牌…",
          onClick: () => {
            const q = (window.prompt("搜索牌名") ?? "").trim().toLowerCase();
            if (!q) return;
            const hits = pieces
              .filter((p) => p.zone === "pile" && p.pileId === menu.pileId)
              .filter((p) => Object.values(p.card.fields).some((v) => String(v).toLowerCase().includes(q)));
            setPeek({ title: `搜索「${q}」`, names: hits.map((p) => `${p.card.fields.name || p.card.id}`) });
          },
        },
        {
          label: "剪牌",
          onClick: () => {
            const n = pieces.filter((p) => p.zone === "pile" && p.pileId === menu.pileId).length;
            if (n < 2) return;
            setClipUi({ pileId: menu.pileId!, n: Math.max(1, Math.floor(n / 2)), max: n });
          },
        },
        {
          label: "切牌",
          submenu: [2, 3, 4, 5, 6].map((k) => ({
            label: `切成 ${k} 叠`,
            disabled: pieces.filter((p) => p.zone === "pile" && p.pileId === menu.pileId).length < k,
            onClick: () => splitPile(menu.pileId!, k),
          })),
        },
        { label: "整叠翻面", onClick: () => flipPile(menu.pileId!) },
        { label: "逆时针 90°", onClick: () => rotatePile(menu.pileId!, -90) },
        { label: "顺时针 90°", onClick: () => rotatePile(menu.pileId!, 90) },
        { label: "横置", onClick: () => setPileRot(menu.pileId!, 90) },
        { label: "倒置", onClick: () => setPileRot(menu.pileId!, 180) },
        { label: "转正", onClick: () => setPileRot(menu.pileId!, 0) },
      ]
    : menu?.pieceId
      ? [
          { label: "翻面", onClick: () => flip(menu.pieceId!) },
          { label: "逆时针 90°", onClick: () => rotateBy(menu.pieceId!, -90) },
          { label: "顺时针 90°", onClick: () => rotateBy(menu.pieceId!, 90) },
          { label: "横置", onClick: () => setRot(menu.pieceId!, 90) },
          { label: "倒置", onClick: () => setRot(menu.pieceId!, 180) },
          { label: "转正", onClick: () => setRot(menu.pieceId!, 0) },
          ...(selectedCards.length >= 2
            ? [{ label: "合并为牌堆", onClick: () => mergeSelected() }]
            : []),
          {
            label: "写批注",
            onClick: () => {
              const piece = pieces.find((p) => p.id === menu.pieceId);
              if (!piece) return;
              setReviews((m) => ({ ...m, [piece.card.id]: m[piece.card.id] ?? { score: 7, text: "" } }));
              setReviewCard(piece.card.id);
              setReviewOpen(true);
            },
          },
          {
            label: "收到手上",
            onClick: () =>
              setPieces((list) =>
                list.map((p) =>
                  p.id === menu.pieceId ? { ...p, zone: "hand", pileId: undefined, ownerId: me.id, face: "front" } : p,
                ),
              ),
          },
          {
            label: "放回牌库",
            onClick: () => {
              const first = primaryPile(current!)?.id ?? piles[0];
              if (!first) return;
              const top = pileTop(pieces, first);
              const face = faceForPile(pieces, first, current);
              const targets =
                selected.size > 1 && selected.has(menu.pieceId!)
                  ? selectionPieceIds(pieces, selected)
                  : new Set([menu.pieceId!]);
              setPieces((list) =>
                list.map((p) =>
                  targets.has(p.id)
                    ? {
                        ...p,
                        zone: "pile",
                        pileId: first,
                        face,
                        ownerId: undefined,
                        rot: top?.rot ?? 0,
                        x: top?.x ?? p.x,
                        y: top?.y ?? p.y,
                      }
                    : p,
                ),
              );
            },
          },
          ...(setByName(current!, "弃牌堆")
            ? [
                {
                  label: "放入弃牌堆",
                  onClick: () => {
                    const dump = setByName(current!, "弃牌堆")!;
                    const top = pileTop(pieces, dump.id);
                    const anchor = anchorsRef.current[dump.id];
                    const face = faceForPile(pieces, dump.id, current);
                    const targets =
                      selected.size > 1 && selected.has(menu.pieceId!)
                        ? selectionPieceIds(pieces, selected)
                        : new Set([menu.pieceId!]);
                    setPieces((list) =>
                      list.map((p) =>
                        targets.has(p.id)
                          ? {
                              ...p,
                              zone: "pile" as const,
                              pileId: dump.id,
                              face,
                              ownerId: undefined,
                              rot: top?.rot ?? 0,
                              x: top?.x ?? anchor?.x ?? p.x,
                              y: top?.y ?? anchor?.y ?? p.y,
                            }
                          : p,
                      ),
                    );
                  },
                },
              ]
            : []),
        ]
      : [];

  function renderFace(piece: Piece, width: number, forceFace?: "front" | "back") {
    const face = forceFace ?? piece.face;
    const tpl = tplFor(piece, forceFace);
    if (!current || !tpl) return <div className="thumb-ph" />;
    const srcUrl = roomId ? (playCardSrc(tpl, face, piece.card.fields) ?? piece.thumbUrl) : undefined;
    return (
      <CardThumb
        template={tpl}
        project={current}
        fields={piece.card.fields}
        cardId={`${piece.id}-${face}`}
        width={width}
        dpi={180}
        face={face}
        frameStyle={frameStyle}
        cropBleed
        srcUrl={srcUrl}
      />
    );
  }

  function inspectTarget(): Piece | undefined {
    if (!hoverId || drag) return undefined;
    if (hoverId.startsWith("pile:")) return pileTop(pieces, hoverId.slice(5));
    return pieces.find((p) => p.id === hoverId);
  }

  if (!meId) {
    return (
      <div className="play-root play-scene">
        <div className="page play-lobby">
          <p className="muted">正在识别本机玩家…</p>
        </div>
      </div>
    );
  }

  if (hostPrep) {
    return (
      <div className="play-root play-scene">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-small" onClick={cancelPrep}>
              {t("play.back")}
            </button>
            <strong>{t("play.title")}{current ? ` · ${current.meta.name}` : ""}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{versionStamp()}</span>
          </div>
          <PrefsMenu />
        </header>
        <JoinWaitPanel
          code={hostPrep.code}
          failed={hostPrep.failed}
          hint={hostPrep.hint}
          steps={hostPrep.steps}
          packNote={
            hostPrep.cardTotal > 0
              ? t("play.prep.cardsNote", { got: hostPrep.cardGot, total: hostPrep.cardTotal })
              : undefined
          }
          report=""
          title={hostPrep.failed ? t("play.prep.fail") : hostPrep.mode === "solo" ? t("play.prep.soloTitle") : t("play.prep.title")}
          alwaysBack
          onBack={cancelPrep}
        />
      </div>
    );
  }

  if (lobby && !setupMode) {
    return (
      <div className="play-root play-scene">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-small" onClick={backFromLobby}>
              {t("play.back")}
            </button>
            <strong>{t("play.title")}{current ? ` · ${current.meta.name}` : ""}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{versionStamp()}</span>
          </div>
          <PrefsMenu />
        </header>
        <div className="page play-lobby">
          <h1>{t("play.lobbyHost")}</h1>
          <p className="muted">{t("play.lobbyHostLead")}</p>
          <div className="form card" style={{ padding: 20, maxWidth: 520 }}>
            {current ? (
              <p className="muted" style={{ marginTop: 0 }}>
                将用「{current.meta.name}」开房。工作板项目可改；订阅项目只读试玩。
              </p>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>{t("play.hostNeedProject")}</p>
            )}
            <div className="field">
              <label>{t("play.visibility")}</label>
              <select
                value={roomPrivate ? "private" : "public"}
                onChange={(e) => setRoomPrivate(e.target.value === "private")}
              >
                <option value="public">{t("play.public")}</option>
                <option value="private">{t("play.private")}</option>
              </select>
            </div>
            <div className="field">
              <label>{t("play.roomPw")}</label>
              <input
                value={roomPassword}
                placeholder={t("play.pwOptional")}
                onChange={(e) => setRoomPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t("play.maxPlayers")}</label>
              <input
                type="number"
                min={2}
                max={16}
                value={roomMax}
                onChange={(e) => setRoomMax(Math.max(2, Math.min(16, Number(e.target.value) || 8)))}
              />
            </div>
            {current && (
              <div className="toolbar">
                <button className="btn btn-primary" onClick={startSolo}>
                  {t("play.solo")}
                </button>
                <button className="btn" onClick={startHost}>
                  {t("play.host")}
                </button>
              </div>
            )}
            {!current && (
              <button type="button" className="btn btn-primary" onClick={() => goHome("host")}>
                {t("play.goPickProject")}
              </button>
            )}
            {netHint && <p className="muted play-share">{netHint}</p>}
          </div>
          <SiteTags />
        </div>
      </div>
    );
  }

  if (!current) {
    const report = formatJoinReport({
      code: roomId ?? joinCode,
      env: joinEnv,
      kind: joinKind,
      phase: joinPhaseRef.current,
      pack: packProg,
      lastDetail: netHint,
      stamp: versionStamp(),
    });
    return (
      <div className="play-root play-scene">
        <header className="topbar">
          <div className="row">
            <button className="btn btn-ghost btn-small" onClick={backFromTable}>
              {t("play.back")}
            </button>
            <strong>{t("play.title")} · {t("play.waiting")}</strong>
          </div>
        </header>
        <div className="play-stage">
        <JoinWaitPanel
          code={roomId ?? joinCode}
          failed={joinFailed}
          kind={joinKind}
          hint={netHint}
          steps={joinSteps}
          packNote={packProg ? t("play.netPack", { got: packProg.got, total: packProg.total }) : undefined}
          report={report}
          onBack={backFromTable}
          onCopy={() => logNet(t("play.copiedDiag"))}
        />
        <PlayChat meId={me.id} players={players} messages={chats} onSend={sendChat} />
        </div>
      </div>
    );
  }

  const cardFitH = Math.max(88, handH - 52);
  const handCardSz = current
    ? pieceSize(current, myHand[0]?.setId ?? current.sets[0]?.id ?? "")
    : { w: 92, h: 128 };
  const handCardW = Math.max(36, Math.round((cardFitH * handCardSz.w) / handCardSz.h));
  const handCount = myHand.length + (handDrop ? 1 : 0);
  const handSpread =
    handCount <= 1
      ? handCardW
      : Math.min(handCardW - 12, Math.max(26, (handCardW * 7.2) / handCount));
  const handRailW = Math.round(
    Math.min(920, Math.max(236, handCount === 0 ? 248 : 36 + handCardW + Math.max(0, handCount - 1) * handSpread)),
  );

  function beginHandResize(e: PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = handH;
    const move = (ev: globalThis.PointerEvent) => {
      const next = Math.max(HAND_H_MIN, Math.min(HAND_H_MAX, startH + (startY - ev.clientY)));
      setHandH(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem("ceditor-hand-h", String(handHRef.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function togglePlayFs() {
    const root = document.querySelector(".play-root");
    try {
      if (!document.fullscreenElement && root instanceof HTMLElement) {
        await root.requestFullscreen();
        setPlayFs(true);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setPlayFs(false);
      } else {
        setPlayFs((v) => !v);
      }
    } catch {
      setPlayFs((v) => !v);
    }
  }

  return (
    <div className={`play-root play-scene in-table ${playFs ? "play-fs" : ""} ${setupMode ? "play-setup" : ""}`} data-table={look.tableTheme}>
      <header className="topbar">
        <div className="row">
          <IconBtn title={t("play.back")} onClick={backFromTable}>
            <IconChevLeft />
          </IconBtn>
          <IconBtn title={t("play.fullscreen")} onClick={() => void togglePlayFs()}>
            <IconExpand size={16} />
          </IconBtn>
          <strong className="play-title-mini" title={current.meta.name}>
            {current.meta.name}
          </strong>
          {roomId && (
            <span className="play-room-code">
              {roomId}
              <IconBtn
                title={t("play.copyCode")}
                onClick={() => void navigator.clipboard.writeText(roomId).then(() => logNet(`已复制房号 ${roomId}`))}
              >
                <IconCopy />
              </IconBtn>
              <IconBtn
                title={t("play.copyLink")}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(playJoinUrl(roomId, lanOrigins[0] ?? window.location.origin))
                    .then(() => logNet(t("play.copiedLan")))
                }
              >
                <IconLink />
              </IconBtn>
            </span>
          )}
        </div>
        <div className="row play-toolbar">
          <IconBtn title="缩小" onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.35, v.zoom / 1.15) }))}>
            <IconMinus />
          </IconBtn>
          <span className="play-zoom-lbl">{Math.round(view.zoom * 100)}%</span>
          <IconBtn title="放大" onClick={() => setView((v) => ({ ...v, zoom: Math.min(3, v.zoom * 1.15) }))}>
            <IconPlus />
          </IconBtn>
          <IconBtn title="复位视角" onClick={() => setView(centerTableView(1))}>
            <IconFit />
          </IconBtn>
          <span className="play-tool-sep" />
          <IconBtn title="抓取" active={toolMode === "grab"} onClick={() => setToolMode("grab")}>
            <IconGrab />
          </IconBtn>
          <IconBtn title="绘画" active={toolMode === "draw"} onClick={() => setToolMode("draw")}>
            <IconPen />
          </IconBtn>
          <IconBtn title="文字" active={toolMode === "text"} onClick={() => setToolMode("text")}>
            <IconText />
          </IconBtn>
          {toolMode === "draw" && (
            <>
              <IconBtn title="笔" active={drawTool === "pen"} onClick={() => setDrawTool("pen")}>
                <IconPen />
              </IconBtn>
              <IconBtn title="线" active={drawTool === "line"} onClick={() => setDrawTool("line")}>
                <IconLine />
              </IconBtn>
              <IconBtn title="方形" active={drawTool === "rect"} onClick={() => setDrawTool("rect")}>
                <IconRect />
              </IconBtn>
              <IconBtn title="圆" active={drawTool === "ellipse"} onClick={() => setDrawTool("ellipse")}>
                <IconCircle />
              </IconBtn>
              <IconBtn title="擦除" active={drawTool === "erase"} onClick={() => setDrawTool("erase")}>
                <IconErase />
              </IconBtn>
              <input type="color" value={drawColor} onChange={(e) => setDrawColor(e.target.value)} title="画笔颜色" />
            </>
          )}
          <span className="play-tool-sep" />
          <IconBtn title={t("play.tools")} active={toolsOpen} onClick={() => setToolsOpen((v) => !v)}>
            <IconDice />
          </IconBtn>
          <IconBtn title="批注" active={reviewOpen} onClick={() => setReviewOpen((v) => !v)}>
            <IconStar />
          </IconBtn>
          <IconBtn title="笔记本" active={noteOpen} onClick={() => setNoteOpen((v) => !v)}>
            <IconNote />
          </IconBtn>
          <div className="play-look-wrap">
            <IconBtn title="背景音乐" active={bgmId !== "off" || bgmOpen} onClick={() => setBgmOpen((v) => !v)}>
              <IconMusic />
            </IconBtn>
            {bgmOpen && (
              <div className="play-look-panel card">
                <select
                  value={bgmId}
                  onChange={(e) => {
                    const id = e.target.value as BgmId;
                    setBgmId(id);
                    playBgm(id, bgmVol);
                  }}
                >
                  {BGM_TRACKS.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.name}
                    </option>
                  ))}
                </select>
                {bgmId !== "off" && (
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={Math.round(bgmVol * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setBgmVol(v);
                      setBgmVolume(v);
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {role !== "guest" && (
            <>
              <IconBtn title="回撤" disabled={!histN.past} onClick={roomUndo}>
                <IconUndo />
              </IconBtn>
              <IconBtn title="前进" disabled={!histN.future} onClick={roomRedo}>
                <IconRedo />
              </IconBtn>
            </>
          )}
          {setupMode ? (
            <>
              <IconBtn title="保存为默认桌面" className="btn-primary" onClick={saveTableSetup}>
                <IconSave />
              </IconBtn>
              <IconBtn title="重置为默认发牌" onClick={resetToDeal}>
                <IconRefresh />
              </IconBtn>
            </>
          ) : (
            <IconBtn title="重新开局" onClick={reset}>
              <IconRefresh />
            </IconBtn>
          )}
          <IconBtn title="手牌收回" disabled={!myHand.length} onClick={returnHand}>
            <IconReturn />
          </IconBtn>
          {roomId && (
            <div className="play-look-wrap">
              <IconBtn title={t("play.roomSet")} active={roomSetOpen} onClick={() => setRoomSetOpen((v) => !v)}>
                <IconUsers />
              </IconBtn>
              {roomSetOpen && (
                <div className="play-look-panel card">
                  {role !== "guest" && (
                    <>
                      <label>
                        {t("play.visibility")}
                        <select
                          value={roomPrivate ? "private" : "public"}
                          onChange={(e) => setRoomPrivate(e.target.value === "private")}
                        >
                          <option value="public">{t("play.public")}</option>
                          <option value="private">{t("play.private")}</option>
                        </select>
                      </label>
                      <label>
                        {t("play.roomPw")}
                        <input value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} />
                      </label>
                      <label>
                        {t("play.maxPlayers")}
                        <input
                          type="number"
                          min={2}
                          max={16}
                          value={roomMax}
                          onChange={(e) => setRoomMax(Math.max(2, Math.min(16, Number(e.target.value) || 8)))}
                        />
                      </label>
                    </>
                  )}
                  <label className="row">
                    <input
                      type="checkbox"
                      checked={look.showOppHands}
                      onChange={(e) => look.setLook({ showOppHands: e.target.checked })}
                    />
                    {t("play.showOppHands")}
                  </label>
                </div>
              )}
            </div>
          )}
          <div className="play-look-wrap">
            <IconBtn
              title={t("play.tableSet")}
              active={lookOpen}
              onClick={() => setLookOpen((v) => !v)}
            >
              <IconEye />
            </IconBtn>
            {lookOpen && (
              <div className="play-look-panel card">
                <label className="row">
                  <input
                    type="checkbox"
                    checked={look.outline}
                    onChange={(e) => look.setLook({ outline: e.target.checked })}
                  />
                  卡牌描边
                </label>
                <label className="row">
                  颜色
                  <input
                    type="color"
                    value={look.outlineColor}
                    onChange={(e) => look.setLook({ outlineColor: e.target.value })}
                    disabled={!look.outline}
                  />
                </label>
                <label className="row">
                  <input
                    type="checkbox"
                    checked={look.shadow}
                    onChange={(e) => look.setLook({ shadow: e.target.checked })}
                  />
                  卡牌阴影
                </label>
                <label>
                  阴影强度 {Math.round(look.shadowStrength * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(look.shadowStrength * 100)}
                    disabled={!look.shadow}
                    onChange={(e) => look.setLook({ shadowStrength: Number(e.target.value) / 100 })}
                  />
                </label>
                <label>
                  手牌磨砂 {Math.round(look.handOpacity * 100)}%
                  <input
                    type="range"
                    min={12}
                    max={80}
                    value={Math.round(look.handOpacity * 100)}
                    onChange={(e) => look.setLook({ handOpacity: Number(e.target.value) / 100 })}
                  />
                </label>
                <label>
                  桌布
                  <select
                    value={look.tableTheme}
                    onChange={(e) => look.setLook({ tableTheme: e.target.value as (typeof TABLE_THEMES)[number]["id"] })}
                  >
                    {TABLE_THEMES.map((th) => (
                      <option key={th.id} value={th.id}>
                        {th.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  桌子大小
                  <select value={tablePreset} onChange={(e) => applyTablePreset(e.target.value as TablePresetId)}>
                    {TABLE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  天气
                  <select
                    value={look.weather}
                    onChange={(e) => look.setLook({ weather: e.target.value as (typeof WEATHERS)[number]["id"] })}
                  >
                    {WEATHERS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          <PrefsMenu />
        </div>
      </header>
      {netHint && !wanBusy && <div className="banner">{netHint}</div>}
      <div className={`play-stage ${setupMode ? "setup" : ""}`}>
        {wanBusy && (
          <div className="play-net-overlay">
            <span className="play-net-spin" aria-hidden />
            <p>{netHint || t("play.netConnecting")}</p>
          </div>
        )}
        <div className="play-roster-dock">
          <PlayRoster
            players={players}
            meId={me.id}
            hostId={players.find((p) => p.host)?.id ?? (role !== "guest" ? me.id : "")}
            canHost={role !== "guest"}
            latencyMs={latencyMs ?? undefined}
            peekId={peekSeat}
            onPeek={setPeekSeat}
            onColor={changePlayerColor}
            onKick={kickPlayer}
          />
        </div>
      <div
        ref={feltRef}
        className="play-felt"
        onWheel={onWheel}
        onPointerDown={onFeltPointerDown}
        onContextMenu={(e) => {
          if (skipMenu.current) {
            e.preventDefault();
            skipMenu.current = false;
            return;
          }
          if (selectedCards.length >= 2) {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, pieceId: selectedCards[0] });
          }
        }}
      >
        <PlayWeather kind={look.weather} />
        {others.length === 0 && roomId && (
          <div className="play-wait-hint muted">
            {lanLoopback ? (
              <div>{t("play.lanLoopback")}</div>
            ) : (
              <>
                <div>{t("play.waitJoin")}</div>
                <div>{t("play.waitRemote", { code: roomId })}</div>
                {(lanOrigins.length ? lanOrigins : [window.location.origin]).map((o) => (
                  <div key={o}>{playJoinUrl(roomId, o)}</div>
                ))}
              </>
            )}
          </div>
        )}
        {look.showOppHands && others.length > 0 && (
          <div className="play-opp-rail">
            {others.map((p) => {
              const cards = pieces
                .filter((x) => x.zone === "hand" && x.ownerId === p.id)
                .sort((a, b) => a.z - b.z);
              const peeking = peekSeat === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`play-opp-seat ${peeking ? "peek" : ""}`}
                  style={{ borderColor: p.color || "var(--line)" }}
                  onClick={() => setPeekSeat(peeking ? null : p.id)}
                >
                  <div className="play-opp-meta" style={{ color: p.color || "var(--muted)" }}>
                    {p.name || t("play.player")} · {t("play.cards", { n: cards.length })}
                  </div>
                  <div className="play-opp-cards">
                    {cards.length === 0 && <span className="muted">{t("play.handEmpty")}</span>}
                    {cards.slice(0, 14).map((c, i) => {
                      const sz = pieceSize(current, c.setId);
                      const w = Math.round((68 * sz.w) / sz.h);
                      return (
                        <div key={c.id} className="play-opp-card" style={{ width: w, marginLeft: i === 0 ? 0 : -w * 0.52 }}>
                          {renderFace(c, w, "back")}
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="play-hud" style={others.length ? { top: 8 } : undefined}>
          <div>框选空白 · 右键菜单 · 点空白关闭菜单</div>
          {hoverId && (
            <div>
              Q 逆时针 · E 顺时针 · F 翻面{hoverId.startsWith("pile:") ? " · R 洗牌 · 1–9 抽入手牌" : ""} · G 合并
            </div>
          )}
        </div>
        <div
          className="play-world"
          style={{ transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})` }}
        >
          <div className="play-table" style={{ width: TABLE.w, height: TABLE.h }}>
            <span className="play-table-caption">牌桌</span>
          </div>
          <PlayDrawLayer strokes={strokes} width={TABLE.w} height={TABLE.h} />
          {drag?.kind === "marquee" && (
            <div
              className="play-marquee"
              style={{
                left: Math.min(drag.x0, drag.x1),
                top: Math.min(drag.y0, drag.y1),
                width: Math.abs(drag.x1 - drag.x0),
                height: Math.abs(drag.y1 - drag.y0),
              }}
            />
          )}
          {shuffleFx && (
            <div className="play-shuffle-burst" style={{ left: shuffleFx.x, top: shuffleFx.y }}>
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="play-shuffle-ghost" style={{ ["--i" as string]: i }} />
              ))}
            </div>
          )}
          {drag?.kind === "pile" &&
            [1, 2, 3].map((i) => {
              const top = pileTop(pieces, drag.pileId);
              if (!top) return null;
              return (
                <div
                  key={`ghost-${i}`}
                  className="play-pile-ghost"
                  style={{
                    left: top.x + i * 6,
                    top: top.y - i * 8,
                    zIndex: Math.max(0, top.z - i),
                    width: pieceSize(current, drag.pileId).w,
                    height: pieceSize(current, drag.pileId).h,
                    transform: `rotate(${-8 + i * 5}deg)`,
                    opacity: 0.62 - i * 0.12,
                  }}
                />
              );
            })}
          {[
            ...current.sets.map((set) => ({ pileId: set.id, name: set.name })),
            ...piles
              .filter((id) => !current.sets.some((s) => s.id === id))
              .map((id) => ({ pileId: id, name: "合并牌堆" })),
          ].map(({ pileId, name }) => {
            const top = pileTop(pieces, pileId);
            const sz = pieceSize(current, top?.setId ?? current.sets[0]?.id ?? pileId);
            const count = pieces.filter((p) => p.zone === "pile" && p.pileId === pileId).length;
            if (!top) {
              const pos = anchorsRef.current[pileId] ?? { x: 40 + piles.indexOf(pileId) * 140, y: 120 };
              return (
                <div
                  key={pileId}
                  className={`play-piece ${selected.has(pileKey(pileId)) ? "selected" : ""}`}
                  style={{ left: pos.x, top: pos.y, zIndex: 0, width: sz.w, opacity: 0.45 }}
                  onPointerDown={(e) => onPilePointerDown(e, pileId)}
                >
                  <div className="thumb-ph" style={{ width: sz.w, height: sz.h }} />
                  <div className="muted" style={{ textAlign: "center", marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                    {name} · 空
                  </div>
                </div>
              );
            }
            return (
              <div
                key={pileId}
                className={`play-piece ${drag?.kind === "pile" && drag.pileId === pileId ? "dragging lifting" : ""} ${shuffleFx?.pileId === pileId ? "shuffling" : ""} ${selected.has(pileKey(pileId)) || (drag?.kind === "group" && drag.pileIds.includes(pileId)) ? "selected" : ""}`}
                style={{
                  left: top.x,
                  top: top.y,
                  zIndex: top.z,
                  width: sz.w,
                  transform: `rotate(${(top.rot ?? 0) + (tilts[pileKey(pileId)] ?? 0)}deg) ${drag?.kind === "pile" && drag.pileId === pileId ? "translateY(-12px) scale(1.06)" : ""}`,
                }}
                onPointerDown={(e) => onPilePointerDown(e, pileId)}
                onPointerEnter={() => setHoverId(`pile:${pileId}`)}
                onPointerLeave={() => setHoverId((id) => (id === `pile:${pileId}` ? null : id))}
                onDoubleClick={() => flipPile(pileId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ x: e.clientX, y: e.clientY, pileId });
                }}
              >
                {renderFace(top, sz.w)}
                <span className="play-pile-count">{count}</span>
                <button
                  type="button"
                  className="play-pile-menu"
                  aria-label="牌库操作"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenu({ x: e.clientX, y: e.clientY, pileId });
                  }}
                >
                  ⋯
                </button>
                {drag?.kind === "pile" && drag.pileId === pileId && <span className="play-pile-lift">整叠</span>}
                <div className="muted" style={{ textAlign: "center", marginTop: 4, color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                  {name}
                </div>
              </div>
            );
          })}
          {table.map((piece) => {
            const sz = pieceSize(current, piece.setId);
            return (
            <div
              key={piece.id}
              className={`play-piece ${(drag?.kind === "card" && drag.id === piece.id) || (drag?.kind === "group" && drag.ids.includes(piece.id)) ? "dragging" : ""} ${selected.has(piece.id) ? "selected" : ""} ${spreadFx?.ids.includes(piece.id) ? "spreading" : ""}`}
              style={{
                left: piece.x,
                top: piece.y,
                zIndex: piece.z,
                width: sz.w,
                ["--spread-i" as string]: String(spreadFx?.ids.indexOf(piece.id) ?? 0),
                transform: `rotate(${(piece.rot ?? 0) + (tilts[piece.id] ?? 0)}deg)${(drag?.kind === "card" && drag.id === piece.id) || (drag?.kind === "group" && drag.ids.includes(piece.id)) ? " translateY(-14px) scale(1.08)" : ""}`,
              }}
              onPointerDown={(e) => beginDrag(e, piece)}
              onPointerEnter={() => setHoverId(piece.id)}
              onPointerLeave={() => setHoverId((id) => (id === piece.id ? null : id))}
              onDoubleClick={() => flip(piece.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, pieceId: piece.id });
              }}
            >
              {renderFace(piece, sz.w)}
            </div>
            );
          })}
          {props.map((prop) => (
            <PlayPropView
              key={prop.id}
              prop={prop}
              selected={selected.has(prop.id)}
              moving={
                (drag?.kind === "prop" && drag.id === prop.id) ||
                (drag?.kind === "group" && drag.propIds.includes(prop.id))
              }
              onPatch={patchProp}
              onPointerDown={beginPropDrag}
              onContextMenu={(e, p) => setMenu({ x: e.clientX, y: e.clientY, propId: p.id })}
            />
          ))}
          {others.map((p) => {
            const c = remoteCursors[p.id];
            if (!c) return null;
            const seat = p.color || "#a8b0c2";
            return (
              <div
                key={`cur-${p.id}`}
                className="play-peer-cursor"
                style={{ left: c.x, top: c.y, color: seat, zIndex: 12000 }}
              >
                <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
                  <path fill="currentColor" stroke="#111" strokeWidth="1.2" d="M1.2 1.2 16 10.4l-6.2 1.4 2.4 7.2-3.2 1.1-2.5-7.2L1.2 16.6Z" />
                </svg>
                <span style={{ background: seat, color: cursorInk(seat) }}>{p.name || t("play.player")}</span>
              </div>
            );
          })}
        </div>
      </div>
        <div
          ref={handRef}
          className="play-me"
          style={{
            height: handH,
            borderTopColor: myColor,
            ["--hand-rail-w" as string]: `${handRailW}px`,
            ["--hand-op" as string]: String(look.handOpacity),
          }}
        >
          <button type="button" className="play-hand-resize" title={t("play.handResize")} onPointerDown={beginHandResize} />
      <div className="play-hand-label" style={{ color: myColor }}>
        <PlayAvatar id={me.avatar} color={myColor} size={22} name={me.name} />
        {myHand.length}
      </div>
      <div className="play-hand">
        {myHand.length === 0 && <span className="muted">拖入卡牌</span>}
        {myHand.map((piece, i) => {
          const sz = pieceSize(current, piece.setId);
          const handW = Math.max(36, Math.round((cardFitH * sz.w) / sz.h));
          return (
          <div
            key={piece.id}
            className={`play-piece ${drag?.kind === "card" && drag.id === piece.id ? "dragging" : ""}`}
            style={{
              position: "relative",
              left: 0,
              top: 0,
              width: handW,
              marginLeft: i === 0 ? 0 : handSpread - handW,
              zIndex: i + 1,
              transform: `rotate(${piece.rot ?? 0}deg)`,
            }}
            onPointerDown={(e) => beginDrag(e, piece)}
            onPointerEnter={() => setHoverId(piece.id)}
            onPointerLeave={() => setHoverId((id) => (id === piece.id ? null : id))}
            onDoubleClick={() => flip(piece.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY, pieceId: piece.id });
            }}
          >
            {renderFace(piece, handW)}
          </div>
          );
        })}
      </div>
        </div>
        {handDrop && (
          <div className="play-hand-drop-hint" style={{ bottom: handH + 10 }}>
            松开加入手牌
          </div>
        )}
        {!setupMode && <PlayChat meId={me.id} players={players} messages={chats} onSend={sendChat} />}
        {toolsOpen && (
          <PlayToolbox
            docked
            onClose={() => setToolsOpen(false)}
            onDrop={(kind, extra, cx, cy) => {
              const felt = feltRef.current?.getBoundingClientRect();
              if (!felt) return;
              if (cx < felt.left || cx > felt.right || cy < felt.top || cy > felt.bottom) return;
              addProp(kind, extra, feltXY({ clientX: cx, clientY: cy }));
            }}
            dealN={dealN}
            onDealN={setDealN}
            onDealEach={() => dealEach(dealN)}
            onDrawOneEach={() => dealEach(1)}
            onPassHands={passHands}
            onReturnHands={returnHand}
            tablePreset={tablePreset}
            tableCustom={tableCustom}
            onTablePreset={applyTablePreset}
            onTableCustom={(w, h) => {
              setTableCustom({ w, h });
              if (tablePreset === "custom") setTableDim(w, h);
            }}
          />
        )}
        {reviewOpen && (
          <PlayReview
            rows={Object.entries(reviews).map(([id, r]) => ({
              id,
              name: pieces.find((p) => p.card.id === id)?.card.fields.name || id,
              score: r.score,
              text: r.text,
            }))}
            focusId={reviewCard}
            onFocus={setReviewCard}
            onChange={(id, next) => setReviews((m) => ({ ...m, [id]: next }))}
            onDelete={(id) => {
              setReviews((m) => {
                const n = { ...m };
                delete n[id];
                return n;
              });
              setReviewCard((cur) => (cur === id ? null : cur));
            }}
            onSendChat={(row) => sendChat(`批注「${row.name}」${row.score}/10：${row.text || "（无文字）"}`)}
            onClose={() => setReviewOpen(false)}
            onExport={() => {
              const rows = Object.entries(reviews).map(([id, r]) => {
                const piece = pieces.find((p) => p.card.id === id);
                return { name: piece?.card.fields.name || id, score: r.score, text: r.text };
              });
              const md = reviewsToMarkdown(current.meta.name, rows);
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
              a.download = `${current.meta.name}-试玩纪要.md`;
              a.click();
            }}
          />
        )}
        {noteOpen && <PlayNotebook onClose={() => setNoteOpen(false)} />}
      </div>
      {peek && (
        <div className="modal-backdrop" onClick={() => setPeek(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{peek.title}</h2>
            <ul>
              {peek.names.map((n, i) => (
                <li key={`${n}-${i}`}>{n}</li>
              ))}
            </ul>
            <button type="button" className="btn" onClick={() => setPeek(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
      {altDown && inspectTarget() && (
        <div
          className="play-inspect"
          style={{
            left: Math.min(cursor.x + 18, window.innerWidth - 80 - 260 * inspectZoom),
            top: Math.min(cursor.y + 12, window.innerHeight - 80 - 360 * inspectZoom),
          }}
        >
          {renderFace(inspectTarget()!, Math.round(260 * inspectZoom))}
          <div className="play-inspect-name">{inspectTarget()!.card.fields.name ?? ""}</div>
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
      {clipUi && (
        <div className="play-clip-pop card" style={{ left: 24, bottom: handH + 24 }}>
          <strong>剪牌</strong>
          <p className="muted" style={{ margin: 0 }}>
            从牌堆顶剪下 {clipUi.n} 张，成为独立牌堆
          </p>
          <label>
            {clipUi.n} / {clipUi.max}
            <input
              type="range"
              min={1}
              max={clipUi.max}
              value={clipUi.n}
              onChange={(e) => setClipUi({ ...clipUi, n: Number(e.target.value) })}
            />
          </label>
          <div className="toolbar">
            <button type="button" className="btn btn-small btn-primary" onClick={() => clipPile(clipUi.pileId, clipUi.n)}>
              剪出
            </button>
            <button type="button" className="btn btn-small" onClick={() => setClipUi(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      <OnboardingDock corner="play" />
    </div>
  );
}
