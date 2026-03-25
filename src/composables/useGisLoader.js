import { ref, shallowRef } from 'vue';
import { dispatchGisData } from '../utils/gis/dataDispatcher';

export function useGisLoader() {
    const isLoading = ref(false);
    const lastError = ref(null);
    const warnings = ref([]);
    const errors = ref([]);
    const summary = shallowRef(null);
    const lastPackets = shallowRef([]);
    const lastPacket = shallowRef(null);
    const blobUrls = ref([]);

    function revokeBlobUrls() {
        blobUrls.value.forEach((url) => {
            try {
                URL.revokeObjectURL(url);
            } catch {
                // ignore revoke errors
            }
        });
        blobUrls.value = [];
    }

    async function dispatch(input) {
        isLoading.value = true;
        lastError.value = null;
        warnings.value = [];
        errors.value = [];
        summary.value = null;
        lastPackets.value = [];
        lastPacket.value = null;
        revokeBlobUrls();

        try {
            const {
                packet,
                packets,
                warnings: nextWarnings,
                errors: nextErrors,
                summary: nextSummary,
                blobUrls: nextBlobUrls
            } = await dispatchGisData(input || {});

            warnings.value = Array.isArray(nextWarnings) ? nextWarnings : [];
            errors.value = Array.isArray(nextErrors) ? nextErrors : [];
            summary.value = nextSummary || null;
            lastPackets.value = Array.isArray(packets) ? packets : (packet ? [packet] : []);
            blobUrls.value = Array.isArray(nextBlobUrls) ? nextBlobUrls : [];
            lastPacket.value = packet;

            return {
                packet,
                packets: lastPackets.value,
                warnings: warnings.value,
                errors: errors.value,
                summary: summary.value,
                blobUrls: blobUrls.value
            };
        } catch (error) {
            lastError.value = error;
            throw error;
        } finally {
            isLoading.value = false;
        }
    }

    return {
        isLoading,
        lastError,
        warnings,
        errors,
        summary,
        lastPackets,
        lastPacket,
        blobUrls,
        dispatch,
        revokeBlobUrls
    };
}
