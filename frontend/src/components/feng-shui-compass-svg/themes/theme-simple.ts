import type { FengShuiCompassConfig } from "../types";
const theme: FengShuiCompassConfig = {
  info: {
    id: 5,
    name: "5",
    preview: "theme-polygon-preview.png",
  },
  rotate: 337.5,
  compassSize: {
    width: 800,
    height: 800,
    tianChiRadius: 200,
  },
  // layerFilt: [],
  latticeFill: [],
  scaclStyle: {
    minLineHeight: 10,
    midLineHeight: 25,
    maxLineHeight: 25,
  },
  line: {
    borderColor: "#AAAAAA",
    scaleColor: "#AAAAAA",
    scaleHighlightColor: "#AAAAAA",
  },
  isShowTianxinCross: true,
  data: [
    {
      name: "方位",
      startAngle: 0,
      fontSize: 32,
      textColor: "#ffff00",
      vertical: false,
      togetherStyle: "empty",
      data: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"],
    },
    {
      name: "九星",
      startAngle: 0,
      fontSize: 32,
      textColor: "white",
      shape: "circle",
      data: ["贪", "巨", "禄", "文", "武", "廉", "破", "辅", "弼"],
    },
  ],
};
export default theme;
