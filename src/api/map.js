import axios from 'axios';

export {
    reverseGeocodeTianditu,
    addressToLocation,
    locationToAddress,
    reverseGeocodeByPriority
} from './geocoding';

const amapClient = axios.create({
    // Static deployment mode: call AMap REST API directly (no Vite proxy).
    baseURL: 'https://restapi.amap.com',
    timeout: 8000
});

export async function searchAmapPlaces({
    key,
    keywords,
    city = '',
    page = 1,
    offset = 10,
    extensions = 'base'
}) {
    const response = await amapClient.get('/v3/place/text', {
        params: {
            key,
            keywords,
            city,
            page,
            offset,
            extensions
        }
    });

    return response?.data || {};
}
