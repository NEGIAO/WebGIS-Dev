import type { FengShuiCompassConfig } from "../types";

const theme: FengShuiCompassConfig = {
  info: {
    id: 2,
    name: "地理专业版",
    preview: "theme-compass-preview.png",
  },
  animation: {
    enable: true,
    duration: 1000,
    delay: 100
  },
  rotate: 0,
  autoFontSize: false,
  isShowScale: true,
  compassSize: {
    width: 800,
    height: 800,
  },

  // 仅改颜色：复古质感朱砂暗红（更高级不刺眼）
  latticeFill: [[0, 3, "rgba(150, 30, 30, 0.9)"]],

  scaclStyle: {
    minLineHeight: 10,
    midLineHeight: 25,
    maxLineHeight: 25,
  },

  // 仅改颜色：复古深棕边框 + 鎏金刻度 + 高亮朱砂红
  line: {
    borderColor: "#2B2015",       // 复古深棕黑（罗盘经典底色）
    scaleColor: "#D4B86B",        // 鎏金刻度（质感拉满）
    scaleHighlightColor: "#C92525", // 高亮朱砂红
  },

  isShowTianxinCross: true,

  // 仅改各层文字颜色，层级区分更清晰
  data: [
    {
      name: "八数",
      startAngle: 60,
      fontSize: 18,
      textColor: "#E6C26F", // 鎏金色
      vertical: false,
      togetherStyle: "empty",
      data: ["一", "二", "三", "四", "五", "六", "七", "八"],
    },
    {
      name: ["后先天八卦", "先天八卦", "龙上八煞"],
      startAngle: 66,
      fontSize: 18,
      // 保留三色结构：纯白 | 正红 | 浅鎏金
      textColor: ["#FFFFFF", "#D92121", "#F2D488"],
      vertical: false,
      togetherStyle: "equally",
      data: [
        ["坎", "☰", "辰"], ["艮", "☲", "寅"], ["震", "☱", "申"], ["巽", "☴", "酉"],
        ["离", "☵", "亥"], ["坤", "☶", "卯"], ["兑", "☳", "巳"], ["乾", "☷", "午"],
      ],
    },
    {
      name: "九星",
      startAngle: 0,
      textColor: "#9ED3D8", // 青金色（柔和区分）
      data: ["贪", "巨", "禄", "文", "武", "廉", "破", "辅", "弼"],
    },
    {
      name: "二十四山",
      startAngle: 0,
      textColor: "#FFFFFF", // 核心数据：纯白（最高清晰度，保留不变）
      data: ["子", "癸", "丑", "艮", "寅", "甲", "卯", "乙", "辰", "巽", "巳", "丙", "午", "丁", "未", "坤", "申", "庚", "酉", "辛", "戌", "乾", "亥", "壬"],
    },
    {
      name: "微盘二十四星",
      startAngle: 0,
      textColor: "#B8B8B8", // 浅银灰（弱化次要信息）
      data: ["天 辅", "天 垒", "天 汉", "天 厨", "天 市", "天 桔", "天 苑", "天 衡", "天 官", "天 罡", "太 乙", "天 屏", "太 微", "天 马", "南 极", "天 常", "天 钺", "天 关", "天 潢", "少 微", "天 乙", "天 魁", "天 厩", "天 皇"],
    },
    {
      name: "透地六十龙",
      startAngle: 0,
      textColor: "#F5D7A1", // 浅杏金色
      vertical: true,
      data: ["甲子", "丙子", "戊子", "庚子", "壬子", "乙丑", "丁丑", "己丑", "辛丑", "癸丑", "甲寅", "丙寅", "戊寅", "庚寅", "壬寅", "乙卯", "丁卯", "己卯", "辛卯", "癸卯", "甲辰", "丙辰", "戊辰", "庚辰", "壬辰", "乙巳", "丁巳", "己巳", "辛巳", "癸巳", "甲午", "丙午", "戊午", "庚午", "壬午", "乙未", "丁未", "己未", "辛未", "癸未", "甲申", "丙申", "戊申", "庚申", "壬申", "乙酉", "丁酉", "己酉", "辛酉", "癸酉", "甲戌", "丙戌", "戊戌", "庚戌", "壬戌", "乙亥", "丁亥", "己亥", "辛亥", "癸亥"],
    },
    {
      name: "透地六十龙旺相",
      startAngle: 0,
      textColor: "#7AC1D9", // 淡青蓝色
      vertical: false,
      data: ["三", "八", "二", "一", "四", "三", "六", "一", "三", "九", "八", "三", "三", "七", "三", "四", "五", "一", "三", "五", "四", "七", "二", "八", "四", "六", "一", "七", "三", "六", "五", "九", "二", "四", "一", "五", "三", "五", "三", "三", "三", "八", "五", "七", "一", "八", "三", "七", "七", "九", "八", "五", "二", "九", "五", "七", "九", "四", "九", "五"],
    },
  ],
};

export default theme;