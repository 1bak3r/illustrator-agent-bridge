export type PhotoshopCommand = PhotoshopPingCommand | PhotoshopSvgProofCommand;

export interface PhotoshopPingCommand {
  kind: "ping";
  message?: string;
}

export interface PhotoshopSvgProofCommand {
  kind: "svg_proof";
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  resolution?: number;
}

export interface GeneratedPhotoshopJob {
  id: string;
  jobPath: string;
  resultPath: string;
  photoshopJobPath: string;
  photoshopResultPath: string;
  jsx: string;
}
