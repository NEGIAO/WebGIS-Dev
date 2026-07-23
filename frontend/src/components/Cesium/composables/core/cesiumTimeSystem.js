const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const BEIJING_TIME_ZONE_LABEL = 'UTC+8';
const BEIJING_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});

export function configureBeijingTimeSystem(viewer, Cesium) {
    if (!viewer || !Cesium?.JulianDate) return;

    if (viewer.animation?.viewModel) {
        viewer.animation.viewModel.dateFormatter = (...args) => formatBeijingDate(viewer, Cesium, ...args);
        viewer.animation.viewModel.timeFormatter = (...args) => formatBeijingTime(viewer, Cesium, ...args);
    }

    if (viewer.timeline) {
        const timelineFormatter = (...args) => formatBeijingTimelineLabel(viewer, Cesium, ...args);
        viewer.timeline.makeLabel = timelineFormatter;
        if ('_makeLabel' in viewer.timeline) {
            viewer.timeline._makeLabel = timelineFormatter;
        }
        viewer.timeline.updateFromClock?.();
        viewer.timeline.zoomTo?.(viewer.clock.startTime, viewer.clock.stopTime);
    }

    viewer.scene.requestRender?.();
}

function getBeijingTimeParts(viewer, Cesium, ...args) {
    const julianDate = args.find(isJulianDateLike) || viewer?.clock?.currentTime;
    if (!julianDate) {
        return {
            year: '0000',
            month: '01',
            day: '01',
            hour: '00',
            minute: '00',
            second: '00',
        };
    }

    const date = Cesium.JulianDate.toDate(julianDate);
    const parts = BEIJING_TIME_PARTS_FORMATTER.formatToParts(date);
    const partMap = Object.fromEntries(
        parts
            .filter(({ type }) => type !== 'literal')
            .map(({ type, value }) => [type, value]),
    );

    return {
        year: partMap.year || '0000',
        month: partMap.month || '01',
        day: partMap.day || '01',
        hour: partMap.hour || '00',
        minute: partMap.minute || '00',
        second: partMap.second || '00',
    };
}

function isJulianDateLike(value) {
    return (
        value
        && typeof value.dayNumber === 'number'
        && typeof value.secondsOfDay === 'number'
    );
}

function formatBeijingDate(viewer, Cesium, ...args) {
    const { year, month, day } = getBeijingTimeParts(viewer, Cesium, ...args);
    return `${year}-${month}-${day}`;
}

function formatBeijingTime(viewer, Cesium, ...args) {
    const { hour, minute, second } = getBeijingTimeParts(viewer, Cesium, ...args);
    return `${hour}:${minute}:${second} ${BEIJING_TIME_ZONE_LABEL}`;
}

function formatBeijingTimelineLabel(viewer, Cesium, ...args) {
    const { month, day, hour, minute } = getBeijingTimeParts(viewer, Cesium, ...args);
    return `${month}-${day} ${hour}:${minute}`;
}
