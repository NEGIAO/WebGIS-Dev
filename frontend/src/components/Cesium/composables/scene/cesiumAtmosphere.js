export function configureSolarLighting(viewer) {
    const scene = viewer?.scene;
    const globe = scene?.globe;
    if (!scene || !globe) return;

    globe.enableLighting = true;

    if (scene.sun) {
        scene.sun.show = true;
    }
    if (scene.moon) {
        scene.moon.show = true;
    }
    if (scene.skyBox) {
        scene.skyBox.show = true;
    }

    scene.requestRender?.();
}

export function configureRealisticAtmosphere(viewer, Cesium) {
    const scene = viewer?.scene;
    const globe = scene?.globe;
    if (!scene || !globe) return;

    configureSunLight(scene, Cesium);
    configureSceneFog(scene);

    globe.enableLighting = true;
    globe.showGroundAtmosphere = true;

    setIfExists(globe, 'dynamicAtmosphereLighting', true);
    setIfExists(globe, 'dynamicAtmosphereLightingFromSun', true);
    setIfExists(globe, 'atmosphereLightIntensity', 5.5);
    setIfExists(globe, 'atmosphereHueShift', -0.015);
    setIfExists(globe, 'atmosphereSaturationShift', 0.08);
    setIfExists(globe, 'atmosphereBrightnessShift', 0.02);
    setIfExists(globe, 'lightingFadeInDistance', 15000000.0);
    setIfExists(globe, 'lightingFadeOutDistance', 22000000.0);
    setIfExists(globe, 'nightFadeInDistance', 9000000.0);
    setIfExists(globe, 'nightFadeOutDistance', 16000000.0);
    setCartesian3IfExists(Cesium, globe, 'atmosphereRayleighCoefficient', 5.5e-6, 13.0e-6, 28.4e-6);
    setCartesian3IfExists(Cesium, globe, 'atmosphereMieCoefficient', 21e-6, 21e-6, 21e-6);
    setIfExists(globe, 'atmosphereRayleighScaleHeight', 10000.0);
    setIfExists(globe, 'atmosphereMieScaleHeight', 3200.0);
    setIfExists(globe, 'atmosphereMieAnisotropy', 0.92);

    if (!scene.skyAtmosphere && Cesium?.SkyAtmosphere) {
        scene.skyAtmosphere = createSkyAtmosphere(Cesium);
    }

    const sky = scene.skyAtmosphere;
    if (sky) {
        sky.show = true;
        setIfExists(sky, 'perFragmentAtmosphere', true);
        setIfExists(sky, 'dynamicAtmosphereLighting', true);
        setIfExists(sky, 'dynamicAtmosphereLightingFromSun', true);
        setIfExists(sky, 'hueShift', -0.025);
        setIfExists(sky, 'saturationShift', 0.08);
        setIfExists(sky, 'brightnessShift', 0.03);
        setIfExists(sky, 'atmosphereLightIntensity', 12.0);
        setCartesian3IfExists(Cesium, sky, 'atmosphereRayleighCoefficient', 5.5e-6, 13.0e-6, 28.4e-6);
        setCartesian3IfExists(Cesium, sky, 'atmosphereMieCoefficient', 21e-6, 21e-6, 21e-6);
        setIfExists(sky, 'atmosphereRayleighScaleHeight', 10000.0);
        setIfExists(sky, 'atmosphereMieScaleHeight', 3200.0);
        setIfExists(sky, 'atmosphereMieAnisotropy', 0.92);
    }

    if (scene.sun) {
        scene.sun.show = true;
    }
    if (scene.moon) {
        scene.moon.show = true;
    }
    if (scene.skyBox) {
        scene.skyBox.show = true;
    }
    if ('sunBloom' in scene) {
        scene.sunBloom = true;
    }
    if ('highDynamicRange' in scene) {
        scene.highDynamicRange = true;
    }
    configureBloom(scene);

    scene.requestRender?.();
}

export function captureRealisticAtmosphereState(viewer) {
    const scene = viewer?.scene;
    const globe = scene?.globe;
    if (!scene || !globe) return null;

    const bloom = scene.postProcessStages?.bloom;
    return {
        scene: readProps(scene, ['highDynamicRange', 'sunBloom', 'light']),
        fog: readProps(scene.fog, [
            'enabled',
            'density',
            'minimumBrightness',
            'screenSpaceErrorFactor',
            'visualDensityScalar',
        ]),
        globe: readProps(globe, [
            'enableLighting',
            'showGroundAtmosphere',
            'dynamicAtmosphereLighting',
            'dynamicAtmosphereLightingFromSun',
            'atmosphereLightIntensity',
            'atmosphereHueShift',
            'atmosphereSaturationShift',
            'atmosphereBrightnessShift',
            'lightingFadeInDistance',
            'lightingFadeOutDistance',
            'nightFadeInDistance',
            'nightFadeOutDistance',
            'atmosphereRayleighCoefficient',
            'atmosphereMieCoefficient',
            'atmosphereRayleighScaleHeight',
            'atmosphereMieScaleHeight',
            'atmosphereMieAnisotropy',
        ]),
        skyAtmosphereExisted: !!scene.skyAtmosphere,
        sky: readProps(scene.skyAtmosphere, [
            'show',
            'perFragmentAtmosphere',
            'dynamicAtmosphereLighting',
            'dynamicAtmosphereLightingFromSun',
            'hueShift',
            'saturationShift',
            'brightnessShift',
            'atmosphereLightIntensity',
            'atmosphereRayleighCoefficient',
            'atmosphereMieCoefficient',
            'atmosphereRayleighScaleHeight',
            'atmosphereMieScaleHeight',
            'atmosphereMieAnisotropy',
        ]),
        sun: readProps(scene.sun, ['show']),
        moon: readProps(scene.moon, ['show']),
        skyBox: readProps(scene.skyBox, ['show']),
        bloom: {
            props: readProps(bloom, ['enabled']),
            uniforms: readProps(bloom?.uniforms, ['contrast', 'brightness', 'delta', 'sigma', 'stepSize']),
        },
    };
}

export function restoreRealisticAtmosphere(viewer, Cesium, snapshot) {
    if (!snapshot) return;

    const scene = viewer?.scene;
    const globe = scene?.globe;
    if (!scene || !globe) return;

    writeProps(scene, snapshot.scene, Cesium);
    writeProps(scene.fog, snapshot.fog, Cesium);
    writeProps(globe, snapshot.globe, Cesium);
    writeProps(scene.sun, snapshot.sun, Cesium);
    writeProps(scene.moon, snapshot.moon, Cesium);
    writeProps(scene.skyBox, snapshot.skyBox, Cesium);

    if (scene.skyAtmosphere) {
        writeProps(scene.skyAtmosphere, snapshot.sky, Cesium);
        if (!snapshot.skyAtmosphereExisted) {
            scene.skyAtmosphere.show = false;
        }
    }

    const bloom = scene.postProcessStages?.bloom;
    writeProps(bloom, snapshot.bloom?.props, Cesium);
    writeProps(bloom?.uniforms, snapshot.bloom?.uniforms, Cesium);

    scene.requestRender?.();
}

function configureSunLight(scene, Cesium) {
    if (Cesium?.SunLight) {
        try {
            scene.light = new Cesium.SunLight({
                color: Cesium.Color?.WHITE,
                intensity: 2.35,
            });
        } catch {
            scene.light = new Cesium.SunLight();
        }
    }

    setIfExists(scene.light, 'intensity', 2.35);
}

function configureSceneFog(scene) {
    const fog = scene?.fog;
    if (!fog) return;

    fog.enabled = true;
    setIfExists(fog, 'density', 0.00012);
    setIfExists(fog, 'minimumBrightness', 0.035);
    setIfExists(fog, 'screenSpaceErrorFactor', 2.0);
    setIfExists(fog, 'visualDensityScalar', 0.16);
}

function configureBloom(scene) {
    const bloom = scene?.postProcessStages?.bloom;
    if (!bloom) return;

    bloom.enabled = true;
    if (!bloom.uniforms) return;

    setIfExists(bloom.uniforms, 'contrast', 128.0);
    setIfExists(bloom.uniforms, 'brightness', -0.18);
    setIfExists(bloom.uniforms, 'delta', 1.0);
    setIfExists(bloom.uniforms, 'sigma', 2.5);
    setIfExists(bloom.uniforms, 'stepSize', 4.2);
}

function createSkyAtmosphere(Cesium) {
    try {
        return new Cesium.SkyAtmosphere(Cesium.Ellipsoid?.WGS84);
    } catch {
        return new Cesium.SkyAtmosphere();
    }
}

function setIfExists(target, key, value) {
    if (target && key in target) {
        target[key] = value;
    }
}

function setCartesian3IfExists(Cesium, target, key, x, y, z) {
    if (!target || !(key in target) || !Cesium?.Cartesian3) return;
    target[key] = new Cesium.Cartesian3(x, y, z);
}

function readProps(target, keys) {
    if (!target) return {};

    return keys.reduce((props, key) => {
        if (key in target) {
            props[key] = cloneValue(target[key]);
        }
        return props;
    }, {});
}

function writeProps(target, props = {}, Cesium) {
    if (!target || !props) return;

    Object.entries(props).forEach(([key, value]) => {
        if (key in target) {
            target[key] = reviveValue(value, Cesium);
        }
    });
}

function cloneValue(value) {
    if (value && typeof value === 'object' && 'x' in value && 'y' in value && 'z' in value) {
        return {
            __type: 'Cartesian3',
            x: value.x,
            y: value.y,
            z: value.z,
        };
    }
    return value;
}

function reviveValue(value, Cesium) {
    if (value?.__type === 'Cartesian3' && Cesium?.Cartesian3) {
        return new Cesium.Cartesian3(value.x, value.y, value.z);
    }
    return value;
}
