import { toLonLat } from 'ol/proj';

export function useAreaImageOverlay({
    mapInstance,
    showImageSet,
    imageSetPosition,
    showLargeImg,
    largeImageSrc,
    bounds,
    emit
}) {
    function checkAreaLogic(coord, pixel) {
        if (!mapInstance.value) return;
        const view = mapInstance.value.getView();

        if (!coord) return;

        const zoom = view.getZoom();
        const lonLat = toLonLat(coord);
        const [lon, lat] = lonLat;

        const isInArea =
            lon >= bounds.minLon && lon <= bounds.maxLon &&
            lat >= bounds.minLat && lat <= bounds.maxLat;

        if (zoom >= 17 && isInArea) {
            showImageSet.value = true;
            if (pixel) {
                imageSetPosition.value = { x: pixel[0] + 15, y: pixel[1] + 15 };
            }
        } else {
            showImageSet.value = false;
            if (!showLargeImg.value) showImageSet.value = false;
        }

        emit('location-change', { isInDihuan: isInArea, lonLat });
    }

    function showLargeImage(src) {
        largeImageSrc.value = src;
        showLargeImg.value = true;
        emit('update-news-image', src);
    }

    function closeLargeImage() {
        showLargeImg.value = false;
        largeImageSrc.value = '';
    }

    return {
        checkAreaLogic,
        showLargeImage,
        closeLargeImage
    };
}