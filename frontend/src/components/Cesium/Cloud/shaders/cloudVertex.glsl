// ============================================================
// cloudVertex.glsl — 体积云顶点着色器（参考实现）
// Cesium PostProcessStage 自带顶点着色器，本文件保留作为参考
// ============================================================

in vec3 position;
in vec2 st;

out vec2 v_textureCoordinates;

void main() {
    v_textureCoordinates = st;
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}
