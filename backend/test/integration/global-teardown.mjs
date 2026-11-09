export default async function globalTeardown() {
    await globalThis.__EMBEDDED_POSTGRES__?.stop();
}
