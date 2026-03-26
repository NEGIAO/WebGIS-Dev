export type TifParsed = {
    kind: 'tiff';
    arrayBuffer: ArrayBuffer;
};

export function loadTifBuffer(buffer: ArrayBuffer): TifParsed {
    return {
        kind: 'tiff',
        arrayBuffer: buffer
    };
}
