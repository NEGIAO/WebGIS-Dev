import defaultTheme from "./theme-crice";
import compassTheme from "./theme-compass";
import darkTheme from "./theme-dark";
import polygonTheme from "./theme-polygon";
import simpleTheme from "./theme-simple";
import type { FengShuiCompassConfig } from "../types";
const themes: FengShuiCompassConfig[] = [
  compassTheme,
  defaultTheme,
  darkTheme,
  polygonTheme,
  simpleTheme,
];

export default themes;