import type { FengShuiCompassConfig } from "../types";
const theme: FengShuiCompassConfig = {
  info:{
    id: 1,
    name: "二",
    preview: "theme-crice.png",
  },
  rotate: 337.5,
  animation: {
    enable: false,
  },
  compassSize: {
    width: 800,
    height: 800,
  },
  latticeFill: [
    [0, 1, "rgba(255, 166, 0, 0.57)"],
    // [0, 1, "#FF0000"],
  ],
  scaclStyle:{
    minLineHeight: 10,
    midLineHeight: 25,
    maxLineHeight: 25,
  },
  line: {
    borderColor: "#0fb730",
    scaleColor: "#AAAAAA",
    scaleHighlightColor: "#10b323",
  },
  isShowTianxinCross: false,

  data: [
    {
      name: "圆规尺刻度",
      startAngle: 0,
      textColor: "white",
      vertical: false,
      togetherStyle: "empty",
      data: [
        "0",
        "30",
        "60",
        "90",
        "120",
        "150",
        "180",
        "210",
        "240",
        "270",
        "300",
        "330",
      ],
    },
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
      name: "刻度标记",
      startAngle: 0,
      fontSize: 18,
      textColor: "#cccccc",
      vertical: true,
      togetherStyle: "empty",
      data: [],
    },
  ],
};
export default theme;