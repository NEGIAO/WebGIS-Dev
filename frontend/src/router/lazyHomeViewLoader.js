/**
 * Second-stage Home view loader used to isolate Home route transitive GIS deps
 * from the register/login entry chunk preload graph.
 */
export async function loadHomeView() {
    const mod = await import('../views/HomeView.vue');
    return mod.default;
}
