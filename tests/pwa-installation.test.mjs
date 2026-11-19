import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../app/components/PwaInstallPrompt.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const offline = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");
const installPage = readFileSync(new URL("../app/instalar/page.tsx", import.meta.url), "utf8");
const icon192 = readFileSync(new URL("../app/pwa-icon-192/route.tsx", import.meta.url), "utf8");
const icon512 = readFileSync(new URL("../app/pwa-icon-512/route.tsx", import.meta.url), "utf8");
const iconMaskable = readFileSync(new URL("../app/pwa-icon-maskable-512/route.tsx", import.meta.url), "utf8");

test("manifesto define identidade, início e modo de aplicativo independente", () => {
  assert.match(manifest, /name:\s*"Sociedade Recreativa Guarani"/);
  assert.match(manifest, /short_name:\s*"Guarani"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(manifest, /scope:\s*"\/"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /192x192/);
  assert.match(manifest, /512x512/);
  assert.match(manifest, /pwa-icon-maskable-512/);
  assert.doesNotMatch(manifest, /pwa-icon-192\.png|pwa-icon-512\.png/);
});

test("layout registra manifesto e carrega o componente de instalação", () => {
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /<PwaInstallPrompt\s*\/>/);
  assert.match(layout, /themeColor:\s*"#003D2B"/);
});

test("componente oferece instalação Android, instruções iOS e botão também na tela de login", () => {
  assert.match(prompt, /beforeinstallprompt/);
  assert.match(prompt, /appinstalled/);
  assert.match(prompt, /Instalar/);
  assert.match(prompt, /Adicionar à Tela de Início/);
  assert.match(prompt, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(prompt, /apple-icon-guarani\.png/);
  assert.match(prompt, /guarani:open-install/);
  assert.match(prompt, /const estaNaTelaLogin = pathname === "\/login"/);
  assert.match(prompt, /Instalar aplicativo Guarani/);
  assert.match(prompt, /Tenha o Guarani com um ícone na tela inicial do celular/);
  assert.match(prompt, /dispositivo === "android"/);
  assert.match(prompt, /abra este mesmo endereço no celular/);
});

test("detecção de dispositivo e instalação não fazem setState síncrono dentro de useEffect", () => {
  assert.match(prompt, /useSyncExternalStore/);
  assert.match(prompt, /getDeviceSnapshot/);
  assert.match(prompt, /getStandaloneSnapshot/);
  assert.doesNotMatch(prompt, /setDispositivoMovel|setIos|setInstalada\(modoStandalone\)/);
});

test("service worker não armazena API, sessão ou respostas autenticadas", () => {
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /STATIC_ASSETS/);
  assert.match(worker, /apple-icon-guarani\.png/);
  assert.doesNotMatch(worker, /pwa-icon-192\.png|pwa-icon-512\.png/);
  assert.doesNotMatch(worker, /caches\.put\(request/);
  assert.doesNotMatch(worker, /caches\.match\(request\)/);
  assert.match(offline, /não ficam disponíveis sem conexão/i);
});

test("o sistema oferece página pública de instalação com botão no próprio site", () => {
  assert.match(installPage, /Instalar aplicativo/);
  assert.match(installPage, /guarani:open-install/);
  assert.match(installPage, /apple-icon-guarani\.png/);
});

test("ícones PWA usam o escudo oficial e têm texto alternativo", () => {
  for (const route of [icon192, icon512, iconMaskable]) {
    assert.match(route, /apple-icon-guarani\.png/);
    assert.match(route, /ImageResponse/);
    assert.match(route, /alt="Escudo oficial da Sociedade Recreativa Guarani"/);
    assert.match(route, /eslint-disable @next\/next\/no-img-element/);
  }
});
