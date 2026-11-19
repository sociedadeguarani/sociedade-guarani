import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = readFileSync(new URL("../app/manifest.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const prompt = readFileSync(new URL("../app/components/PwaInstallPrompt.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const offline = readFileSync(new URL("../public/offline.html", import.meta.url), "utf8");

test("manifesto define identidade, início e modo de aplicativo independente", () => {
  assert.match(manifest, /name:\s*"Sociedade Recreativa Guarani"/);
  assert.match(manifest, /short_name:\s*"Guarani"/);
  assert.match(manifest, /start_url:\s*"\/"/);
  assert.match(manifest, /scope:\s*"\/"/);
  assert.match(manifest, /display:\s*"standalone"/);
  assert.match(manifest, /192x192/);
  assert.match(manifest, /512x512/);
});

test("layout registra manifesto e carrega o componente de instalação", () => {
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /<PwaInstallPrompt\s*\/>/);
  assert.match(layout, /themeColor:\s*"#003D2B"/);
});

test("componente oferece instalação Android e instruções de adicionar à tela inicial no iOS", () => {
  assert.match(prompt, /beforeinstallprompt/);
  assert.match(prompt, /appinstalled/);
  assert.match(prompt, /Instalar/);
  assert.match(prompt, /Adicionar à Tela de Início/);
  assert.match(prompt, /serviceWorker\.register\("\/sw\.js"/);
});

test("service worker não armazena API, sessão ou respostas autenticadas", () => {
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /STATIC_ASSETS/);
  assert.doesNotMatch(worker, /caches\.put\(request/);
  assert.doesNotMatch(worker, /caches\.match\(request\)/);
  assert.match(offline, /não ficam disponíveis sem conexão/i);
});
