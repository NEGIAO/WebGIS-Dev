/**
 * 焦散着色器模块
 * TDM (Tiling Domain Mapping) caustic 效果
 */

export const CAUSTIC_GLSL = `
  uniform float uTime;
  uniform float uCaustic;
  varying vec3 vCWorld;

  float causticX( vec2 uv ) {
    vec2 p = mod( uv * 6.28318530718, 6.28318530718 ) - 250.0;
    vec2 i = vec2( p );
    float c = 1.0;
    float inten = 0.005;

    for ( int n = 0; n < 5; n++ ) {
      float t = uTime * 0.5 * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
      i = p + vec2( cos( t - i.x ) + sin( t + i.y ), sin( t - i.y ) + cos( t + i.x ) );
      c += 1.0 / length( vec2( p.x / ( sin( i.x + t ) / inten ), p.y / ( cos( i.y + t ) / inten ) ) );
    }

    c /= 5.0;
    c = 1.17 - pow( c, 1.4 );
    return pow( abs( c ), 8.0 );
  }
`;

/**
 * 为材质添加焦散效果
 * @param {THREE.Material} material - Three.js 材质对象
 * @param {Object} uniforms - 共享的 uniform 对象
 */
export function addCaustics(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uCaustic = uniforms.uCaustic;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vCWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CAUSTIC_GLSL)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
        '  float cDepth = smoothstep( 0.0, -2.0, vCWorld.y );\n' +
        '  float caus = causticX( vCWorld.xz * 0.06 );\n' +
        '  caus += causticX( vCWorld.xz * 0.13 + 40.0 ) * 0.6;\n' +
        '  totalEmissiveRadiance += vec3( 0.45, 0.85, 0.8 ) * caus * cDepth * uCaustic;'
      );
  };
}
