import type { FengShuiCompassConfig } from '../types';
const theme: FengShuiCompassConfig = {
    info: {
        id: 4,
        name: '四',
        preview: 'theme-polygon-preview.png',
    },
    // 整盘不旋转：各层 startAngle 已按「首格中心 = 正北」标定。
    // 历史值 337.5 是为补偿「polygon 层 startAngle 被强制归零」的 hack，
    // 该归零逻辑已移除（多边形顶点本就随 startAngle 旋转），补偿随之作废。
    rotate: 0,
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
        borderColor: '#333333',
        scaleColor: '#D4B86B',
        scaleHighlightColor: '#FFD700',
    },
    isShowTianxinCross: true,
    data: [
        {
            name: '吉凶等级',
            // 8 项层，每格 45°；与其余 8 扇区层统一：起始边 337.5° → 首格中心落在正北
            startAngle: 337.5,
            // 优化：吉凶文字用鎏金色，醒目区分核心信息
            textColor: '#E6C26F',
            vertical: false,
            togetherStyle: 'empty',
            shape: 'polygon',
            data: ['小吉', '大凶', '大吉', '最大吉', '中吉', '最大凶', '小凶', '中凶'],
        },
        {
            name: '八宅八星',
            // 八煞/伏位层坎位在正北，8 扇区文字居中需 -22.5°（337.5°）
            startAngle: 337.5,
            // 优化：八煞用银白色，柔和不刺眼
            textColor: '#F0F0F0',
            vertical: false,
            togetherStyle: 'empty',
            shape: 'polygon',
            data: ['伏  位', '五  鬼', '天  医', '生  气', '延  年', '绝  命', '祸  害', '六  杀'],
        },
        {
            name: ['后先天八卦', '先天八卦', '龙上八煞'],
            // 后天八卦坎在正北：8 扇区文字居中需 -22.5°（337.5°）
            startAngle: 337.5,
            fontSize: 18,
            // 优化：三色分层更清晰，保留卦象红色高亮
            textColor: ['#FFFFFF', '#E74C3C', '#F2D488'],
            vertical: false,
            togetherStyle: 'equally',
            shape: 'polygon',
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
            name: '方位',
            // 文字画在扇区中心；8 方位 span=45°，需 -22.5°(337.5°) 才能让「北」落在正北
            startAngle: 337.5,
            fontSize: 32,
            // 优化：原亮黄太刺眼，改用高级鎏金黄，醒目不突兀
            textColor: '#FFD700',
            vertical: false,
            togetherStyle: 'empty',
            data: ['北', '东   北', '东', '东   南', '南', '西   南', '西', '西   北'],
        },
        {
            name: '九星',
            // 9 扇区文字居中：贪狼居北需 -20°（340°）；数据按北斗次序廉在武前
            startAngle: 340,
            fontSize: 32,
            // 优化：柔和纯白色，核心文字清晰
            textColor: '#FAFAFA',
            shape: 'circle',
            data: ['贪', '巨', '禄', '文', '廉', '武', '破', '辅', '弼'],
        },
    ],
};
export default theme;
