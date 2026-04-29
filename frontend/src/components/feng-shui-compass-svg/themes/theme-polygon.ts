import type { FengShuiCompassConfig } from "../types";
const theme: FengShuiCompassConfig = {
  info: {
    id: 4,
    name: "四",
    preview: "theme-polygon-preview.png",
  },
  rotate: 337.5, // 完全保留原旋转角度
  compassSize: {
    width: 800,
    height: 800,
  },
  latticeFill: [],
  scaclStyle: {
    minLineHeight: 10,
    midLineHeight: 25,
    maxLineHeight: 25,
  },
  // 优化线条配色：深灰边框 + 鎏金刻度 + 明黄高亮，质感拉满
  line: {
    borderColor: "#333333",
    scaleColor: "#D4B86B",
    scaleHighlightColor: "#FFD700",
  },
  isShowTianxinCross: true,
  data: [
    {
      name: "--",
      startAngle: 40,
      // 优化：吉凶文字用鎏金色，醒目区分核心信息
      textColor: "#E6C26F",
      vertical: false,
      togetherStyle: "empty",
      shape: "polygon",
      data: [
        "小吉",
        "大凶",
        "大吉",
        "最大吉",
        "中吉",
        "最大凶",
        "小凶",
        "中凶",
      ],
    },
    {
      name: "--",
      startAngle: 0,
      // 优化：八煞用银白色，柔和不刺眼
      textColor: "#F0F0F0",
      vertical: false,
      togetherStyle: "empty",
      shape: "polygon",
      data: ["伏位", "五鬼", "天医", "生气", "延年", "绝命", "祸害", "六杀"],
    },
    {
      name: ["后先天八卦", "先天八卦", "龙上八煞"],
      startAngle: 0,
      fontSize: 18,
      // 优化：三色分层更清晰，保留卦象红色高亮
      textColor: ["#FFFFFF", "#E74C3C", "#F2D488"],
      vertical: false,
      togetherStyle: "equally",
      shape: "polygon",
      data: [
        ["坎", "☰", "辰"],
        ["艮", "☲", "寅"],
        ["震", "☱", "申"],
        ["巽", "☴", "酉"],
        ["离", "☵", "亥"],
        ["坤", "☶", "卯"],
        ["兑", "☳", "巳"],
        ["乾", "☷", "午"],
      ],
    },
    {
      name: "方位",
      startAngle: 0,
      fontSize: 32,
      // 优化：原亮黄太刺眼，改用高级鎏金黄，醒目不突兀
      textColor: "#FFD700",
      vertical: false,
      togetherStyle: "empty",
      data: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"],
    },
    {
      name: "九星",
      startAngle: 0,
      fontSize: 32,
      // 优化：柔和纯白色，核心文字清晰
      textColor: "#FAFAFA",
      shape: "circle",
      data: ["贪", "巨", "禄", "文", "武", "廉", "破", "辅", "弼"],
    },
  ],
};
export default theme;