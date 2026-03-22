import axios from 'axios';

const amapClient = axios.create({
    baseURL: '/amap-api',
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
