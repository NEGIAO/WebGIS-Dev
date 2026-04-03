import { ref } from 'vue';

export function useStyleEditor() {
    const styleTemplates = [
        // --- 自然资源类 ---
        { id: 'eco_forest', name: '生态绿', color: '#27AE60' },     // 较沉稳的绿，适合植被、公园
        { id: 'hydro_blue', name: '水系蓝', color: '#2980B9' },     // 标准水色，适合河流、湖泊
        
        // --- 应急与热点类 ---
        { id: 'alert_red', name: '预警红', color: '#E74C3C' },      // 极高对比度，适合火点、事故、高风险区
        { id: 'alert_orange', name: '风险橙', color: '#E67E22' },   // 适合热点分析、次高风险
        
        // --- 城市与交通类 ---
        { id: 'road_traffic', name: '交通黄', color: '#F1C40F' },   // 亮黄色，暗色底图下表现极佳
        { id: 'infra_purple', name: '设施紫', color: '#9B59B6' },   // 适合公共服务设施、学校、医疗
        { id: 'urban_gray', name: '工业灰', color: '#95A5A6' },    // 中性色，适合厂区、不透水面、待定区
        
        // --- 新增扩展类（区分度更高） ---
        { id: 'future_cyan', name: '科技青', color: '#1ABC9C' },    // 清新的青色，适合智慧城市、新区规划
        { id: 'energy_pink', name: '电网粉', color: '#FD79A8' },    // 独特的高亮粉，常用于地下管廊或特殊能线
        { id: 'land_brown', name: '土地褐', color: '#A16946' }     // 适合裸地、土木工程、矿区分析
    ];

    const styleForm = ref({
        fillColor: '#27AE60',   // 默认生态绿
        strokeColor: '#FFFFFF', // 默认白色描边（在 GIS 渲染中比同色描边更清晰）
        fillOpacityPct: 35,     // 默认 35% 透明度，兼顾底图可见度与图层覆盖感
        strokeWidth: 1.5,       // 1.5px 粗细最显精致
    });

    /**
     * 构建提交给地图引擎的样式载荷
     */
    function buildStylePayload() {
        return {
            fillColor: styleForm.value.fillColor,
            strokeColor: styleForm.value.strokeColor,
            fillOpacity: styleForm.value.fillOpacityPct / 100, // 0-1 供 WebGIS 引擎调用
            strokeWidth: styleForm.value.strokeWidth,
            // 额外导出百分比，方便 UI 组件双向绑定显示
            fillOpacityPct: styleForm.value.fillOpacityPct
        };
    }

    return {
        styleTemplates,
        styleForm,
        buildStylePayload
    };
}