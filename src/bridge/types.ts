export type BridgeCommand = PingCommand | CartoonSceneCommand | ExportCommand;

export interface PingCommand {
  kind: "ping";
  message?: string;
}

export interface CartoonSceneCommand {
  kind: "cartoon_scene";
  scene: CartoonScene;
}

export interface ExportCommand {
  kind: "export";
  format: ExportFormat;
  outputPath: string;
}

export type ExportFormat = "pdf" | "svg" | "png" | "jpg";

export interface CartoonScene {
  document?: SceneDocument;
  elements: SceneElement[];
}

export interface SceneDocument {
  title?: string;
  width?: number;
  height?: number;
  colorMode?: "RGB" | "CMYK";
}

export type SceneElement = RectElement | EllipseElement | TextElement | LineElement | PolygonElement;

export interface BaseElement {
  name?: string;
  x: number;
  y: number;
  style?: ElementStyle;
}

export interface RectElement extends BaseElement {
  type: "rect";
  width: number;
  height: number;
}

export interface EllipseElement extends BaseElement {
  type: "ellipse";
  width: number;
  height: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  text: string;
  size?: number;
  font?: string;
}

export interface LineElement extends BaseElement {
  type: "line";
  x2: number;
  y2: number;
}

export interface PolygonElement extends BaseElement {
  type: "polygon";
  points: Point[];
}

export interface Point {
  x: number;
  y: number;
}

export interface ElementStyle {
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  opacity?: number;
}

export interface GeneratedJob {
  id: string;
  jobPath: string;
  resultPath: string;
  illustratorJobPath: string;
  illustratorResultPath: string;
  jsx: string;
}
