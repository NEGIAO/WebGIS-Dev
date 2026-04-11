type JSZipModule = typeof import('jszip');
type JSZipCtor = JSZipModule['default'];

let jsZipPromise: Promise<JSZipCtor> | null = null;

function shouldForceReload(messageText: string): boolean {
    const msg = String(messageText || '');
    return msg.includes('Outdated Optimize Dep') || msg.includes('Failed to fetch dynamically imported module');
}

/**
 * Lazy-load JSZip and keep a shared module promise.
 *
 * This avoids evaluating jszip during async component load (e.g. SidePanel),
 * and reduces the chance of cascading loader failures when Vite optimize cache is stale.
 */
export async function loadJsZip(): Promise<JSZipCtor> {
    if (!jsZipPromise) {
        jsZipPromise = import('jszip').then((mod) => mod.default);
    }

    try {
        return await jsZipPromise;
    } catch (error: any) {
        jsZipPromise = null;

        const messageText = String(error?.message || error || '');
        if (typeof window !== 'undefined' && shouldForceReload(messageText)) {
            const guardKey = '__jszip_reload_once__';
            const alreadyReloaded = window.sessionStorage?.getItem(guardKey) === '1';
            if (!alreadyReloaded) {
                window.sessionStorage?.setItem(guardKey, '1');
                window.location.reload();
            }
        }

        throw error;
    }
}
