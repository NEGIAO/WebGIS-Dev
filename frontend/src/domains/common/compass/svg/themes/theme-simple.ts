import type { FengShuiCompassConfig } from '../types';
const theme: FengShuiCompassConfig = {
    info: {
        id: 5,
        name: '5',
        preview: 'theme-polygon-preview.png',
    },
    // 整盘不旋转：各层 startAngle 已按「首格中心 = 正北」标定（337.5 / 340）。
    // 历史值 337.5 会把所有层整体带偏 22.5°，与 startAngle 的补偿重复。
    rotate: 0,
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
        borderColor: '#AAAAAA',
        scaleColor: '#AAAAAA',
        scaleHighlightColor: '#AAAAAA',
    },
    isShowTianxinCross: true,
    data: [
        {
            name: '方位',
            // 文字画在扇区中心；8 方位 span=45°，需 -22.5°(337.5°) 才能让「北」落在正北
            startAngle: 337.5,
            fontSize: 32,
            textColor: '#ffff00',
            vertical: false,
            togetherStyle: 'empty',
            data: ['北', '东   北', '东', '东   南', '南', '西   南', '西', '西   北'],
        },
        {
            name: '九星',
            // 9 扇区文字居中：贪狼居北需 -20°（340°）；数据按北斗次序廉在武前
            startAngle: 340,
            fontSize: 32,
            textColor: 'white',
            shape: 'circle',
            data: ['贪', '巨', '禄', '文', '廉', '武', '破', '辅', '弼'],
        },
    ],
};
export default theme;
