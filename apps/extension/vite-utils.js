import { resolve } from "path";
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";

// Get proxy endpoint from environment variables
export function getProxyEndpoint() {
  // PROXY_ENDPOINT takes precedence if provided
  if (process.env.PROXY_ENDPOINT) {
    return process.env.PROXY_ENDPOINT;
  }

  // Otherwise construct from PROXY_ORIGIN
  const proxyOrigin = process.env.PROXY_ORIGIN || "http://localhost:8787";
  const endpoint = process.env.PROXY_PATH || "/v1/transform";

  // Ensure no double slashes
  const baseUrl = proxyOrigin.replace(/\/$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  return `${baseUrl}${path}`;
}

// Recursively copy files
export function copyRecursive(src, dest) {
  const stats = statSync(src);
  if (stats.isDirectory()) {
    if (!statSync(dest, { throwIfNoEntry: false })) {
      mkdirSync(dest, { recursive: true });
    }
    readdirSync(src).forEach((file) => {
      copyRecursive(resolve(src, file), resolve(dest, file));
    });
  } else {
    copyFileSync(src, dest);
  }
}

// Copy static files to output directory
export function copyStaticFiles(staticDir, outDir) {
  if (statSync(staticDir, { throwIfNoEntry: false })) {
    readdirSync(staticDir).forEach((file) => {
      copyRecursive(resolve(staticDir, file), resolve(outDir, file));
    });
    console.log("✅ Static files copied");
  }
}

// Copy CSS files from src to src directory in output
export function copyCssFiles(srcDir, outDir) {
  const srcOutDir = resolve(outDir, "src");
  if (!statSync(srcOutDir, { throwIfNoEntry: false })) {
    mkdirSync(srcOutDir, { recursive: true });
  }

  // Recursively find and copy CSS files preserving directory structure
  function findAndCopyCss(dir, baseDir, outBaseDir) {
    if (!statSync(dir, { throwIfNoEntry: false })) return;

    readdirSync(dir).forEach((file) => {
      const filePath = resolve(dir, file);
      const stats = statSync(filePath);

      if (stats.isDirectory()) {
        findAndCopyCss(filePath, baseDir, outBaseDir);
      } else if (file.endsWith(".css")) {
        const relativePath = filePath.replace(baseDir + "/", "");
        const destPath = resolve(outBaseDir, relativePath);
        const destDir = resolve(destPath, "..");

        if (!statSync(destDir, { throwIfNoEntry: false })) {
          mkdirSync(destDir, { recursive: true });
        }

        copyFileSync(filePath, destPath);
        console.log(`✅ Copied CSS file: ${relativePath}`);
      }
    });
  }

  findAndCopyCss(srcDir, srcDir, srcOutDir);
}

// Copy single file with background.js processing
export function copyFileWithProcessing(src, dest, staticDir) {
  copyFileSync(src, dest);
  const relativePath = src.replace(staticDir + "/", "");
  console.log(`✅ Updated static file: ${relativePath}`);
}
