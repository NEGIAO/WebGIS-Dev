import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';
import { fromLonLat } from 'ol/proj';
import { saveUserPositionToCache } from '../utils/userPositionCache';
import { useMessage } from './useMessage';

export function useUserLocation({
    mapInstance,
    userLocationSource,
    isDomestic
}) {
    const message = useMessage();
    function isCoordinateInChina(lon, lat) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
        return lon >= 73.0 && lon <= 135.0 && lat >= 18.0 && lat <= 54.0;
    }

    async function detectIPLocale() {
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (!res.ok) return { isDomestic: false };
            const data = await res.json();
            const cc = data.country || data.country_code || data.country_name;
            const isDom = typeof cc === 'string' && (
                cc.toString().toUpperCase().includes('CN')
                || cc.toString().toLowerCase().includes('china')
            );
            isDomestic.value = isDom;
            return { isDomestic: isDom };
        } catch (e) {
            console.warn('IP locale detect failed', e);
            isDomestic.value = false;
            return { isDomestic: false };
        }
    }

    function getCurrentLocation(enableHighAccuracy = true) {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));

            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({
                    lon: pos.coords.longitude,
                    lat: pos.coords.latitude,
                    accuracy: pos.coords.accuracy
                }),
                (err) => reject(err),
                { enableHighAccuracy, timeout: 5000 }
            );
        });
    }

    function updateUserPosition(pos, animate = true) {
        if (!pos || !mapInstance.value) return;
        const coord = fromLonLat([pos.lon, pos.lat]);

        saveUserPositionToCache(pos);

        userLocationSource.clear();
        userLocationSource.addFeature(new Feature({
            geometry: new CircleGeom(coord, pos.accuracy || 30),
            type: 'accuracy'
        }));
        userLocationSource.addFeature(new Feature({
            geometry: new Point(coord),
            type: 'position'
        }));

        if (animate && mapInstance.value) {
            mapInstance.value.getView().animate({ center: coord, zoom: 18, duration: 1000 });
        }
    }

    async function zoomToUser() {
        try {
            const pos = await getCurrentLocation();
            updateUserPosition(pos, true);
        } catch (err) {
            console.warn('定位失败:', err.message);
            message.error('无法获取您的位置，请确保允许定位权限。', { closable: true, duration: 6000 });
        }
    }

    return {
        isCoordinateInChina,
        detectIPLocale,
        getCurrentLocation,
        zoomToUser,
        updateUserPosition
    };
}