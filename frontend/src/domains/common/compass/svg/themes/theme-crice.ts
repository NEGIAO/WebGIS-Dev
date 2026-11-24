import type { FengShuiCompassConfig } from '../types';

/**
 * 翡翠境：深墨玉底 + 翡翠文字 + 鎏金刻度。
 * 层级与 startAngle 遵循 V3.7.10 的全量校正结果，确保「子/贪/坎/北」均在正北。
 */
const theme: FengShuiCompassConfig = {
    info: {
        id: 1,
        name: '翡翠境',
        preview: 'theme-crice.png',
    },
    rotate: 0,
    animation: {
        enable: false,
    },
    compassSize: {
        width: 800,
        height: 800,
    },
    latticeFill: [
        [0, 0, 'rgba(211, 255, 224, 0.18)'],
        [0, 3, 'rgba(255, 231, 150, 0.16)'],
    ],
    scaclStyle: {
        minLineHeight: 10,
        midLineHeight: 22,
        maxLineHeight: 26,
    },
    line: {
        borderColor: '#0B3B2E',
        scaleColor: '#C8A45D',
        scaleHighlightColor: '#7FFFD4',
    },
    isShowTianxinCross: true,
    tianxinCrossColor: '#D4FFE6',
    tianxinCrossWidth: 2,

    data: [
        {
            name: '八数',
            // 先天卦数配先天方位：N=坤八、NE=震四、E=离三、SE=兑二、S=乾一、SW=巽五、W=坎六、NW=艮七
            startAngle: 337.5,
            fontSize: 16,
            textColor: '#BFE8D5',
            vertical: false,
            togetherStyle: 'empty',
            data: ['八', '四', '三', '二', '一', '五', '六', '七'],
        },
        {
            name: ['后先天八卦', '先天八卦', '龙上八煞'],
            // 后天八卦坎在正北：8 扇区文字居中需 -22.5°（337.5°）
            startAngle: 337.5,
            fontSize: 16,
            textColor: ['#E8FFF5', '#7FE3C0', '#F5D98B'],
            vertical: false,
            togetherStyle: 'equally',
            data: [
                ['坎', '☷', '辰'],
                ['艮', '☳', '寅'],
                ['震', '☲', '申'],
                ['巽', '☱', '酉'],
                ['离', '☰', '亥'],
                ['坤', '☴', '卯'],
                ['兑', '☵', '巳'],
                ['乾', '☶', '午'],
            ],
        },
        {
            name: '九星',
            // 9 扇区文字居中：贪狼居北需 -20°（340°）；数据按北斗次序廉在武前
            startAngle: 340,
            fontSize: 18,
            textColor: '#9DE0C0',
            vertical: false,
            togetherStyle: 'empty',
            data: ['贪', '巨', '禄', '文', '廉', '武', '破', '辅', '弼'],
        },
        {
            name: '二十四山',
            // 数据从「子」起，24 山每山 15°：子居中需 -7.5°（352.5°）
            startAngle: 352.5,
            fontSize: 17,
            textColor: '#F2FFF8',
            vertical: false,
            togetherStyle: 'empty',
            data: [
                '子', '癸', '丑', '艮', '寅', '甲',
                '卯', '乙', '辰', '巽', '巳', '丙',
                '午', '丁', '未', '坤', '申', '庚',
                '酉', '辛', '戌', '乾', '亥', '壬',
            ],
        },
        {
            name: '微盘二十四星',
            // 逆序天星数据：起点天辅、终点天皇；337.5° 使天皇在亥、天市在艮
            startAngle: 337.5,
            fontSize: 12,
            textColor: '#7FBFA5',
            vertical: false,
            togetherStyle: 'empty',
            data: [
                '天 辅', '天 汉', '天 厨', '天 市', '天 棓',
                '天 苑', '天 官', '天 罡', '太 乙', '天 屏',
                '太 微', '天 极', '天 常', '天 钺', '天 关',
                '天 潢', '少 乙', '天 魁', '天 厩', '天 皇',
            ],
        },
        {
            name: '方位',
            // 文字画在扇区中心；8 方位 span=45°，需 -22.5°(337.5°) 才能让「北」落在正北
            startAngle: 337.5,
            fontSize: 30,
            textColor: '#FFE08A',
            vertical: false,
            togetherStyle: 'empty',
            data: ['北', '东   北', '东', '东   南', '南', '西   南', '西', '西   北'],
        },
    ],
};

export default theme;
