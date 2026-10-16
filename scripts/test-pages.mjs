// Test-only static server emulating a repository subdirectory on GitHub Pages.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const base = process.env.PAGES_BASE_PATH || "/Lib_website/";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  if (!path.startsWith(base)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = resolve(root, path.slice(base.length) || "index.html");
  if (!file.startsWith(root + "/")) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}${base}`;
let browser;
try {
  const html = await readFile(resolve(root, "index.html"), "utf8");
  assert.ok(
    html.includes(`src="${base}assets/`),
    "Built script URL must retain repository base",
  );
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  await mkdir("artifacts", { recursive: true });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.url().includes("/assets/") && r.status() !== 200)
        errors.push(r.url());
    });
    await page.goto(url);
    await page.getByRole("heading", { name: /A world of life/ }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `artifacts/production-${name}.png`,
      fullPage: true,
    });
    await page.goto(url + "#/catalogue");
    await page
      .getByRole("heading", { name: "The library catalogue" })
      .waitFor();
    await page.goto(url + "#/student/loans");
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      `PASS built ${name}: subpath assets, catalogue deep link, private route, responsive width, no JavaScript errors`,
    );
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
