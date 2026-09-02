export const PROJECT_SCHEMA_VERSION = 1;

export type SizeMm = { w: number; h: number };

export type LayerType = "text" | "image" | "rect" | "icon" | "group";

export type TextAlign = "left" | "center" | "right" | "justify";
export type VAlign = "top" | "middle" | "bottom";
export type ImageFit = "cover" | "contain";
export type TextOverflow = "clip" | "ellipsis" | "shrink";
export type LayerShape = "rect" | "round" | "circle" | "ellipse" | "diamond" | "triangle" | "hex" | "pill";

export type LayerStyle = {
  fill?: string;
  shape?: LayerShape;
  stroke?: string;
  strokeWidthMm?: number;
  fontFamily?: string;
  fontSizeMm?: number;
  fontWeight?: string | number;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: TextAlign;
  valign?: VAlign;
  color?: string;
  opacity?: number;
  fit?: ImageFit;
  lineHeight?: number;
  letterSpacingMm?: number;
  paragraphSpacingMm?: number;
  textStroke?: string;
  textStrokeWidthMm?: number;
  background?: string;
  autosize?: boolean;
  fontSizeMinMm?: number;
  fontSizeMaxMm?: number;
  overflow?: TextOverflow;
  tint?: string;
  /** TMP Margins：左/上/右/下（mm），文本在框内再内缩 */
  marginLeftMm?: number;
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  /** 按边角底色抠除，让图标以外露出下层 */
  knockout?: boolean;
  shadowColor?: string;
  shadowBlurMm?: number;
  shadowXMm?: number;
  shadowYMm?: number;
  glowColor?: string;
  glowBlurMm?: number;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
};

export type LayerVarMap = {
  text?: string;
  fill?: string;
  stroke?: string;
  color?: string;
  background?: string;
  src?: string;
  repeat?: string;
  /** 绑定数据集 bool（或真值）字段，控制图层 Active/显隐 */
  active?: string;
};

export type Layer = {
  id: string;
  type: LayerType;
  name: string;
  /** 蓝图预览 / 默认文案；属性转为变量后由卡牌集对应列覆盖 */
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  style: LayerStyle;
  visible?: boolean;
  /**
   * @deprecated 改用 vars.active 绑定 bool 字段
   * 按卡牌字段显隐。分号 AND。
   */
  visibleWhen?: string;
  locked?: boolean;
  /** 右键「转为变量」后的属性 → 数据集列名。有此对象时不再按图层名自动进表。 */
  vars?: LayerVarMap;
  /** 图片/图标按 repeat 变量重复时，一行几个 */
  repeatPerRow?: number;
  /** 父图层 id。子图层 x/y 相对父图层左上角 */
  parentId?: string;
};

export type Template = {
  id: string;
  name: string;
  face: "front" | "back";
  size: SizeMm;
  bleedMm: number;
  cornerRadiusMm: number;
  layers: Layer[];
};

export type PieceKind = "card" | "board";

export type Blueprint = {
  id: string;
  name: string;
  /** 缺省视为卡牌。卡牌无厚度；板件可设 thicknessMm */
  kind?: PieceKind;
  size: SizeMm;
  /** 仅板件。卡牌忽略 */
  thicknessMm?: number;
  bleedMm: number;
  cornerRadiusMm: number;
  frontLayers: Layer[];
  backLayers: Layer[];
};

export type CardSetView = {
  id: string;
  name: string;
  columnOrder: string[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
};

export type CardSet = {
  id: string;
  name: string;
  blueprintId: string;
  cards: Card[];
  fieldKeys: string[];
  /** 列类型：bool 在数据集里显示为勾选 */
  fieldTypes?: Record<string, FieldType>;
  views?: CardSetView[];
  activeViewId?: string;
};

export type FieldType = "text" | "bool" | "image" | "number";

export type Card = {
  id: string;
  qty: number;
  fields: Record<string, string>;
};

export type Deck = {
  id: string;
  name: string;
  frontTemplateId: string;
  backTemplateId: string;
  cards: Card[];
  fieldKeys: string[];
  fieldTypes?: Record<string, FieldType>;
};

export type ProjectVariable = {
  id: string;
  tag: string;
  replacement: string;
  kind: "text" | "icon";
  tint?: string;
};

export type ProjectFont = {
  id: string;
  family: string;
  assetId: string;
};

export type ProjectMeta = {
  id: string;
  name: string;
  note?: string;
  coverAsset?: string;
  createdAt: string;
  updatedAt: string;
  defaultSize: SizeMm;
};

export type PlaySetupSnapshot = {
  pieces: unknown[];
  props: unknown[];
};

export type Project = {
  schemaVersion: number;
  meta: ProjectMeta;
  templates: Template[];
  decks: Deck[];
  blueprints: Blueprint[];
  sets: CardSet[];
  boxes?: PackagingBox[];
  rulebooks?: Rulebook[];
  assets: Record<string, string>;
  variables: ProjectVariable[];
  print?: PrintSettings;
  fonts?: ProjectFont[];
  /** Default table layout used when hosting / resetting play. */
  playSetup?: PlaySetupSnapshot;
};

export type BoxFace = "top" | "bottom" | "front" | "back" | "left" | "right";

export type UvIsland = {
  u: number;
  v: number;
  w: number;
  h: number;
  scaleX?: number;
  scaleY?: number;
  uniformScale?: boolean;
  rotationDeg?: number;
  flipU?: boolean;
  flipV?: boolean;
};

export type BoxRenderSetup = {
  position: { x: number; y: number; z: number };
  rotationDeg: { x: number; y: number; z: number };
  camera: { yaw: number; pitch: number; distance: number; fov: number };
  lights: {
    key: { yaw: number; pitch: number; intensity: number; color: string };
    fillIntensity?: number;
    ambient?: number;
  };
  background?: string;
  cullBackground?: boolean;
  cullOutsideBox?: boolean;
  resolutionW?: number;
  resolutionH?: number;
};

export type PackagingBox = {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  textureAssetId?: string;
  faces: Record<BoxFace, UvIsland>;
  render?: BoxRenderSetup;
};

export type Rulebook = {
  id: string;
  name: string;
};

export type AppIndexEntry = {
  id: string;
  name: string;
  /** 列表显示路径。工作板应是用户填写的本地完整路径 */
  path: string;
  /** 用户确认的本地完整路径，例如 F:\卡牌\三国杀 */
  localPath?: string;
  note?: string;
  coverAsset?: string;
  coverThumb?: string;
  lastOpenedAt: string;
  origin?: "owned" | "subscribed" | "example";
  marketId?: string;
};

export type AppIndex = {
  projects: AppIndexEntry[];
  examplesSeeded?: boolean;
};

export type PaperId = "a4" | "letter" | "legal" | "tabloid" | "custom";

export type PrintSettings = {
  paper: PaperId;
  orientation: "portrait" | "landscape";
  customW: number;
  customH: number;
  marginMm: number;
  gapMm: number;
  bleedMm: number;
  cutMarks: boolean;
  cutColor: string;
  cutLengthMm: number;
  offsetX: number;
  offsetY: number;
  duplex: boolean;
  dpi: number;
  filename: string;
  mode?: "print" | "tts";
  ttsCols?: number;
  ttsRows?: number;
};

export type ViewportPrefs = {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridMm: number;
  gridColor: string;
  showBleed: boolean;
  showSafe: boolean;
  showCut: boolean;
  /** 预览时沿裁切线裁掉出血像素（不是把成品缩放铺满） */
  cropBleed: boolean;
  bleedColor: string;
  safeColor: string;
  cutColor: string;
  snap: boolean;
  snapCorners: boolean;
  snapCenters: boolean;
  snapCut: boolean;
  snapSafe: boolean;
  snapBleed: boolean;
  snapGrid: boolean;
};
