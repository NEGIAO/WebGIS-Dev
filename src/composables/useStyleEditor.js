import { ref } from 'vue';

export function useStyleEditor() {
    const styleTemplates = [
        { id: 'classic', name: '经典绿', color: '#2f9a57' },
        { id: 'warning', name: '警示橙', color: '#e39a28' },
        { id: 'water', name: '水系蓝', color: '#3d88e6' },
        { id: 'magenta', name: '品红', color: '#cd4f9f' }
    ];

    const styleForm = ref({
        fillColor: '#5fbf7a',
        strokeColor: '#2f7d3c',
        fillOpacityPct: 24,
        strokeWidth: 2
    });

    function buildStylePayload() {
        return {
            fillColor: styleForm.value.fillColor,
            strokeColor: styleForm.value.strokeColor,
            fillOpacity: styleForm.value.fillOpacityPct / 100,
            strokeWidth: styleForm.value.strokeWidth
        };
    }

    return {
        styleTemplates,
        styleForm,
        buildStylePayload
    };
}
