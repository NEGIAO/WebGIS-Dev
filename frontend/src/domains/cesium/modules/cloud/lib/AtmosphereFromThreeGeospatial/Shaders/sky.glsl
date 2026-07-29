// Copied & adapted from three-geospatial SkyMaterial shaders.
// Note: This file is included into a Cesium PostProcessStage fragment shader.

// RECIPROCAL_PI is expected by some ground terms.
#ifndef RECIPROCAL_PI
#define RECIPROCAL_PI 0.3183098861837907
#endif

#ifndef PI
#define PI 3.1415926535897932384626433832795
#endif

vec3 getSkyRadiance(
  const vec3 cameraPosition,
  const vec3 rayDirection,
  const float shadowLength,
  const vec3 sunDirection
) {
  vec3 transmittance;
  vec3 radiance = GetSkyRadiance(
    cameraPosition,
    rayDirection,
    shadowLength,
    sunDirection,
    transmittance
  );

  // Rendering celestial objects without perspective doesn't make sense.
  #ifdef PERSPECTIVE_CAMERA

  #ifdef SUN
  vec3 ddx = dFdx(rayDirection);
  vec3 ddy = dFdy(rayDirection);
  float fragmentAngle = length(ddx + ddy) / max(length(rayDirection), 1e-6);
  #endif // SUN

  #ifdef SUN
  float viewDotSun = dot(rayDirection, sunDirection);
  if (viewDotSun > cos(ATMOSPHERE.sun_angular_radius)) {
    // 当太阳在地球背面时，太阳盘应被地球遮挡。
    // cameraPosition / ATMOSPHERE.bottom_radius 均为 length unit（此工程为 km）。
    float bSun = dot(cameraPosition, rayDirection);
    float cSun = dot(cameraPosition, cameraPosition) - ATMOSPHERE.bottom_radius * ATMOSPHERE.bottom_radius;
    float discSun = bSun * bSun - cSun;
    bool sunOccludedByEarth = (discSun > 0.0) && ((-bSun - sqrt(discSun)) > 0.0);
    if (sunOccludedByEarth) {
      return radiance;
    }

    float angle = acos(clamp(viewDotSun, -1.0, 1.0));
    float antialias = smoothstep(
      ATMOSPHERE.sun_angular_radius,
      ATMOSPHERE.sun_angular_radius - fragmentAngle,
      angle
    );
    radiance += transmittance * GetSolarRadiance() * antialias;
  }
  #endif // SUN

  #endif // PERSPECTIVE_CAMERA

  return radiance;
}

