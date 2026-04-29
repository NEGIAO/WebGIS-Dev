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
  
  // 1. 格子填充：将第一层（索引0）的特定格子改为更有质感的暗红色，而不是亮红色
  latticeFill: [[0, 3, "rgba(180, 40, 40, 0.8)"]],

  scaclStyle: {
    minLineHeight: 10,
    midLineHeight: 25,
    maxLineHeight: 25,
  },

  // 2. 核心线条颜色：改用深棕色和复古金色
  line: {
    borderColor: "#3D3D3D",       // 深灰黑边框，比纯黑更柔和
    scaleColor: "#A68966",        // 刻度改用古铜金色，专业感强
    scaleHighlightColor: "#C0392B", // 高亮刻度使用朱砂红
  },

  isShowTianxinCross: true,
  
  // 3. 每一层的文字颜色配置
  data: [
    {
      name: "八数",
      startAngle: 60,
      fontSize: 18,
      textColor: "#D4AC0D", // 琥珀金
      vertical: false,
      togetherStyle: "empty",
      data: ["一", "二", "三", "四", "五", "六", "七", "八"],
    },
    {
      name: ["后先天八卦", "先天八卦", "龙上八煞"],
      startAngle: 66,
      fontSize: 18,
      // 第一列白色，第二列（卦象）红色，第三列（辰寅等）浅黄
      textColor: ["#FFFFFF", "#E74C3C", "#F7DC6F"], 
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
      textColor: "#AED6F1", // 浅天蓝，增加辨识度
      data: ["贪", "巨", "禄", "文", "武", "廉", "破", "辅", "弼"],
    },
    {
      name: "二十四山",
      startAngle: 0,
      textColor: "#FFFFFF", // 纯白，核心数据保持最高清晰度
      data: ["子", "癸", "丑", "艮", "寅", "甲", "卯", "乙", "辰", "巽", "巳", "丙", "午", "丁", "未", "坤", "申", "庚", "酉", "辛", "戌", "乾", "亥", "壬"],
    },
    {
      name: "微盘二十四星",
      startAngle: 0,
      textColor: "#BDC3C7", // 浅灰色，次要信息弱化
      data: ["天辅", "天垒", "天汉", "天厨", "天市", "天桔", "天苑", "天衡", "天官", "天罡", "太乙", "天屏", "太微", "天马", "南极", "天常", "天钺", "天关", "天潢", "少微", "天乙", "天魁", "天厩", "天皇"],
    },
    {
      name: "透地六十龙",
      startAngle: 0,
      textColor: "#FAD7A0", // 浅杏色
      vertical: true,
      data: ["甲子", "丙子", "戊子", "庚子", "壬子", "乙丑", "丁丑", "己丑", "辛丑", "癸丑", "甲寅", "丙寅", "戊寅", "庚寅", "壬寅", "乙卯", "丁卯", "己卯", "辛卯", "癸卯", "甲辰", "丙辰", "戊辰", "庚辰", "壬辰", "乙巳", "丁巳", "己巳", "辛巳", "癸巳", "甲午", "丙午", "戊午", "庚午", "壬午", "乙未", "丁未", "己未", "辛未", "癸未", "甲申", "丙申", "戊申", "庚申", "壬申", "乙酉", "丁酉", "己酉", "辛酉", "癸酉", "甲戌", "丙戌", "戊戌", "庚戌", "壬戌", "乙亥", "丁亥", "己亥", "辛亥", "癸亥"],
    },
    {
      name: "透地六十龙旺相",
      startAngle: 0,
      textColor: "#85C1E9", // 淡蓝色
      vertical: false,
      data: ["三", "八", "二", "一", "四", "三", "六", "一", "三", "九", "八", "三", "三", "七", "三", "四", "五", "一", "三", "五", "四", "七", "二", "八", "四", "六", "一", "七", "三", "六", "五", "九", "二", "四", "一", "五", "三", "五", "三", "三", "三", "八", "五", "七", "一", "八", "三", "七", "七", "九", "八", "五", "二", "九", "五", "七", "九", "四", "九", "五"],
    },
  ],
};

export default theme;