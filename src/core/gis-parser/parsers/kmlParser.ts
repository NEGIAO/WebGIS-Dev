export type KmlParsed = {
    kind: 'kml';
    content: string;
};

export function parseKmlBuffer(buffer: ArrayBuffer): KmlParsed {
    const content = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    return {
        kind: 'kml',
        content
    };
}
